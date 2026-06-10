// Simple worker scaffold: process 'render-video' jobs using BullMQ if available
// Falls back to a local in-process queue when Redis/BullMQ aren't installed.

async function runWorker() {
  let useBull = false;
  let Queue, Worker, QueueScheduler;
  let connection;

  try {
    ({ Queue, Worker, QueueScheduler } = require('bullmq'));
    const IORedis = require('ioredis');
    const IORedisClient = require('ioredis');
    const net = require('net');
    const redisUrl = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
    // quick TCP probe to avoid ioredis retry/ECONNREFUSED noise
    try {
      const url = new URL(redisUrl);
      const host = url.hostname || '127.0.0.1';
      const port = Number(url.port) || 6379;
      await new Promise((resolve, reject) => {
        const sock = net.connect({ host, port }, () => {
          sock.destroy();
          resolve(true);
        });
        sock.setTimeout(800);
        sock.on('error', (err) => { try { sock.destroy(); } catch(e){}; reject(err); });
        sock.on('timeout', () => { try { sock.destroy(); } catch(e){}; reject(new Error('timeout')); });
      });
      // if probe succeeded, create ioredis client with conservative options
      connection = new IORedisClient(redisUrl, { connectTimeout: 2000, enableOfflineQueue: false });
      useBull = true;
      console.log('BullMQ + Redis reachable. Starting worker...');
    } catch (probeErr) {
      console.warn('Redis probe failed — falling back to in-memory worker.');
      connection = null;
      useBull = false;
    }
  } catch (err) {
    console.warn('BullMQ or Redis not available — falling back to in-memory worker.');
  }

  if (useBull) {
    const queueName = 'render-video';
    const scheduler = new QueueScheduler(queueName, { connection });
    const worker = new Worker(
      queueName,
      async (job) => {
        console.log('Processing job', job.id, 'payload:', job.data);
        const { lesson } = job.data;
        const jobKey = job.data.jobId || job.id;
        if (!lesson || !Array.isArray(lesson.storyboard)) {
          throw new Error('Job payload missing lesson.storyboard');
        }
        // perform render
        const { renderLessonToFile } = require('../lib/renderUtils');
        const { uploadFile } = require('../lib/storage');
        const { setJobStatus } = require('../lib/jobStore');
        const prisma = require('../lib/prisma');
        const path = require('path');
        try {
          await setJobStatus(jobKey, 'processing', { pid: process.pid });
          const { tempDir, outputPath } = await renderLessonToFile(lesson);
          console.log('Rendered lesson to', outputPath);
          const destKey = `renders/${path.basename(outputPath)}`;
          const uploaded = await uploadFile(outputPath, destKey);
          await setJobStatus(jobKey, 'completed', { url: uploaded.url, key: uploaded.key });
          // update DB job record if present
          try {
            if (job.data.jobId) {
              await prisma.job.update({ where: { id: job.data.jobId }, data: { status: 'completed', meta: JSON.stringify({ url: uploaded.url }) } });
              await prisma.asset.create({ data: { jobId: job.data.jobId, url: uploaded.url, key: uploaded.key } });
            }
          } catch (e) { console.warn('prisma update/create asset failed', e.message || e); }
          return { ok: true, outputPath, uploaded };
        } catch (err) {
          console.error('Render failed for job', job.id, err);
          try { await setJobStatus(jobKey, 'failed', { error: String(err) }); } catch (e) {}
          if (job.data.jobId) {
              try {
              const record = await prisma.job.findUnique({ where: { id: job.data.jobId } });
              let recordMeta = {};
              try { recordMeta = typeof record?.meta === 'string' ? JSON.parse(record.meta || '{}') : (record?.meta || {}); } catch (e) { recordMeta = {}; }
              if (record?.userId && recordMeta?.creditCost) {
                await prisma.user.update({ where: { id: record.userId }, data: { credits: { increment: recordMeta.creditCost } } });
              }
              await prisma.job.update({ where: { id: job.data.jobId }, data: { status: 'failed', meta: JSON.stringify({ ...recordMeta, error: String(err) }) } });
            } catch (refundErr) {
              console.warn('Failed to refund credits after worker failure:', refundErr.message || refundErr);
            }
          }
          throw err;
        }
      },
      { connection }
    );

    worker.on('completed', (job) => console.log('Completed job', job.id));
    worker.on('failed', (job, err) => console.error('Job failed', job.id, err));

    process.on('SIGTERM', async () => {
      await worker.close();
      await scheduler.close();
      await connection.quit();
      process.exit(0);
    });

    console.log('Worker running and waiting for jobs...');
  } else {
    // In-memory demo: poll a local file or simulate a job loop
    console.log('Running in-memory worker demo. No persistent queue.');
    // Provide a simple HTTP endpoint to accept jobs in-memory, or listen on IPC in advanced setups.
    // For simplicity, expose a minimal CLI listener: process stdin for JSON job payloads.
    process.stdin.setEncoding('utf8');
    let buffer = '';
    process.stdin.on('data', (chunk) => {
      buffer += chunk;
      try {
        const job = JSON.parse(buffer);
        buffer = '';
        (async () => {
          const { renderLessonToFile } = require('../lib/renderUtils');
          const { setJobStatus } = require('../lib/jobStore');
          const prisma = require('../lib/prisma');
          if (!job.lesson) {
            console.warn('In-memory job missing lesson');
            return;
          }
          const jobKey = job.jobId || 'inmemory-' + Date.now();
          try {
            await setJobStatus(jobKey, 'processing', { pid: process.pid });
            console.log('Processing in-memory job');
            const { tempDir, outputPath } = await renderLessonToFile(job.lesson);
            console.log('In-memory render complete:', outputPath);
            const { uploadFile } = require('../lib/storage');
            const path = require('path');
            const destKey = `renders/${path.basename(outputPath)}`;
            const uploaded = await uploadFile(outputPath, destKey);
            await setJobStatus(jobKey, 'completed', { url: uploaded.url, key: uploaded.key });
            if (job.jobId) {
              try { await prisma.job.update({ where: { id: job.jobId }, data: { status: 'completed', meta: JSON.stringify({ url: uploaded.url }) } }); await prisma.asset.create({ data: { jobId: job.jobId, url: uploaded.url, key: uploaded.key } }); } catch (e) { console.warn('prisma update failed', e); }
            }
          } catch (e) {
            console.error('In-memory job failed', e);
            try { await setJobStatus(jobKey, 'failed', { error: String(e) }); } catch (e) {}
            if (job.jobId) {
              try {
                const record = await prisma.job.findUnique({ where: { id: job.jobId } });
                let recordMeta = {};
                try { recordMeta = typeof record?.meta === 'string' ? JSON.parse(record.meta || '{}') : (record?.meta || {}); } catch (errMeta) { recordMeta = {}; }
                if (record?.userId && recordMeta?.creditCost) {
                  await prisma.user.update({ where: { id: record.userId }, data: { credits: { increment: recordMeta.creditCost } } });
                }
                await prisma.job.update({ where: { id: job.jobId }, data: { status: 'failed', meta: JSON.stringify({ ...recordMeta, error: String(e) }) } });
              } catch (refundErr) {
                console.warn('Failed to refund credits after in-memory job failure:', refundErr.message || refundErr);
              }
            }
          }
        })();
      } catch (e) {
        // not a complete JSON payload yet
      }
    });
  }
}

runWorker().catch((err) => {
  console.error('Worker failed to start:', err);
  process.exit(1);
});
