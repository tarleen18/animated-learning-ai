const path = require('path');
let redis = null;
let inMemory = new Map();

async function getRedis() {
  if (redis) return redis;
  if (!process.env.REDIS_URL) return null;
  try {
    const IORedis = require('ioredis');
    const client = new IORedis(process.env.REDIS_URL, { connectTimeout: 2000, enableOfflineQueue: false });
    await client.ping();
    redis = client;
    return redis;
  } catch (e) {
    console.warn('jobStore: Redis unavailable, using in-memory store');
    redis = null;
    return null;
  }
}

async function setJobStatus(jobId, status, meta = {}) {
  const payload = { status, meta, updatedAt: Date.now() };
  const r = await getRedis();
  if (r) {
    try {
      await r.set(`job:${jobId}`, JSON.stringify(payload), 'EX', 60 * 60 * 24);
      return;
    } catch (e) {
      console.warn('jobStore: redis set failed', e.message || e);
    }
  }
  inMemory.set(jobId, payload);
}

async function getJobStatus(jobId) {
  const r = await getRedis();
  if (r) {
    try {
      const s = await r.get(`job:${jobId}`);
      if (!s) return null;
      return JSON.parse(s);
    } catch (e) {
      console.warn('jobStore: redis get failed', e.message || e);
    }
  }
  return inMemory.get(jobId) || null;
}

module.exports = { setJobStatus, getJobStatus };
