import fs from 'fs';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '../../lib/auth';
import prisma from '../../lib/prisma';
import { renderLessonToFile } from '../../lib/renderUtils';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) return res.status(401).json({ error: 'Unauthorized — please sign in' });

  const { lesson } = req.body;
  if (!lesson || !Array.isArray(lesson.storyboard)) return res.status(400).json({ error: 'Lesson storyboard is required' });

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const renderCost = 1;
  if (user.credits < renderCost) {
    return res.status(402).json({ error: 'Insufficient credits. Buy more credits to render a lesson.' });
  }

  try {
  await prisma.user.update({ where: { id: user.id }, data: { credits: { decrement: renderCost } } });
  // create DB job record first
  const jobRecord = await prisma.job.create({ data: { userId: session.user.id, type: 'render', status: 'queued', meta: JSON.stringify({ title: lesson.title || null, creditCost: renderCost }) } });
  await prisma.billingEvent.create({ data: { userId: user.id, type: 'render', amountCents: 0, credits: renderCost, metadata: JSON.stringify({ jobId: jobRecord.id }) } });

    // If Redis + BullMQ are available, enqueue a job instead of rendering inline.
    let enqueued = false;
    if (process.env.REDIS_URL) {
      try {
        const { Queue } = await import('bullmq');
        const IORedis = (await import('ioredis')).default;
        const connection = new IORedis(process.env.REDIS_URL, { connectTimeout: 2000, enableOfflineQueue: false });
        const queue = new Queue('render-video', { connection });
        const job = await queue.add('render', { lesson, userId: session.user.id, jobId: jobRecord.id });
        // record initial job status in jobStore too
        try { const { setJobStatus } = await import('../../lib/jobStore'); await setJobStatus(job.id, 'queued'); } catch (e) { console.warn('jobStore set queued failed', e.message || e); }
        res.status(202).json({ jobId: jobRecord.id, status: 'queued' });
        enqueued = true;
      } catch (err) {
        console.warn('Failed to enqueue render job, falling back to inline render:', err.message || err);
          try {
          await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: renderCost } } });
          await prisma.job.update({ where: { id: jobRecord.id }, data: { status: 'failed', meta: JSON.stringify({ error: 'queue failure' }) } });
        } catch (refundErr) {
          console.warn('Failed to refund credits after enqueue failure:', refundErr.message || refundErr);
        }
      }
    }

    if (!enqueued) {
      try {
        const { tempDir, outputPath } = await renderLessonToFile(lesson);
        // upload local file as asset and update job in DB
        const { uploadFile } = await import('../../lib/storage');
        const up = await uploadFile(outputPath, `renders/${jobRecord.id}.mp4`);
        await prisma.asset.create({ data: { jobId: jobRecord.id, url: up.url, key: up.key } });
        await prisma.job.update({ where: { id: jobRecord.id }, data: { status: 'completed', meta: JSON.stringify({ url: up.url }) } });

        res.setHeader('Content-Type', 'video/mp4');
        res.setHeader('Content-Disposition', 'attachment; filename="lesson-video.mp4"');
        const stream = fs.createReadStream(outputPath);
        stream.pipe(res);
        stream.on('close', async () => {
          try { await fs.promises.rm(tempDir, { recursive: true, force: true }); } catch (e) {}
        });
      } catch (err) {
        console.error('Inline render failed after credit reservation:', err);
          try {
          await prisma.user.update({ where: { id: user.id }, data: { credits: { increment: renderCost } } });
          await prisma.job.update({ where: { id: jobRecord.id }, data: { status: 'failed', meta: JSON.stringify({ error: 'inline render failure' }) } });
        } catch (refundErr) {
          console.warn('Failed to refund credits after inline render failure:', refundErr.message || refundErr);
        }
        throw err;
      }
    }
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Video render failed' });
  }
}
