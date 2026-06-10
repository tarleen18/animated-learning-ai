// Demo: enqueue a render-video job (uses BullMQ if available, else calls worker directly)

async function enqueueDemo() {
  try {
    if (!process.env.REDIS_URL) {
      throw new Error('REDIS_URL not set — skipping BullMQ enqueue');
    }
    const { Queue } = require('bullmq');
    const IORedis = require('ioredis');
    const connection = new IORedis(process.env.REDIS_URL);
    const queue = new Queue('render-video', { connection });
    const job = await queue.add('render', { lessonId: 'demo-1', payload: { message: 'demo' } });
    console.log('Enqueued job', job.id);
    process.exit(0);
  } catch (err) {
    console.warn('Redis/BullMQ not used — running demo render locally.');
    // fallback: call worker code directly to perform a real local render
    console.log('Running local render demo...');
    const { renderLessonToFile } = require('../lib/renderUtils');
    const demoLesson = {
      learningObjective: 'Demo render',
      keyConcepts: ['demo'],
      storyboard: [
        { number: 1, duration: 2, narration: 'Demo 1', visualDescription: 'Demo 1', animationInstructions: '', onScreenText: 'Demo 1' },
        { number: 2, duration: 3, narration: 'Demo 2', visualDescription: 'Demo 2', animationInstructions: '', onScreenText: 'Demo 2' }
      ],
      memoryAnchors: 'demo',
      commonMisconceptions: 'demo',
      finalSummary: 'demo'
    };
    try {
      const { tempDir, outputPath } = await renderLessonToFile(demoLesson);
      console.log('Local demo render complete:', outputPath);
      console.log('Temporary directory:', tempDir);
    } catch (err2) {
      console.error('Local demo render failed:', err2);
      process.exit(1);
    }
    process.exit(0);
  }
}

enqueueDemo().catch((err) => { console.error(err); process.exit(1); });
