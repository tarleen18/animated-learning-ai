const OpenAI = require('openai');
const Ajv = require('ajv');
const crypto = require('crypto');
const { getServerSession } = require('next-auth/next');
const { authOptions } = require('../../lib/auth');
const prisma = require('../../lib/prisma');

// Simple in-memory cache and rate limiter for local/dev. If REDIS_URL is set,
// the code will attempt to use Redis for caching instead.
let redisClient = null;
async function getRedisClient() {
  if (redisClient) return redisClient;
  if (!process.env.REDIS_URL) return null;
  try {
    const IORedis = require('ioredis');
    const client = new IORedis(process.env.REDIS_URL, { connectTimeout: 2000, enableOfflineQueue: false });
    await client.ping();
    redisClient = client;
    return redisClient;
  } catch (e) {
    console.warn('Redis unavailable, falling back to in-memory cache.');
    redisClient = null;
    return null;
  }
}

const inMemoryCache = new Map();
function setCacheLocal(key, value, ttlMs = 5 * 60 * 1000) {
  inMemoryCache.set(key, { value, expires: Date.now() + ttlMs });
}
function getCacheLocal(key) {
  const entry = inMemoryCache.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expires) {
    inMemoryCache.delete(key);
    return null;
  }
  return entry.value;
}

async function getCachedLesson(key) {
  const r = await getRedisClient();
  if (r) {
    try {
      const s = await r.get(key);
      if (s) return JSON.parse(s);
    } catch (e) {
      console.warn('Redis get failed:', e.message || e);
    }
  }
  return getCacheLocal(key);
}

async function setCachedLesson(key, lesson, ttlSec = 300) {
  const r = await getRedisClient();
  if (r) {
    try {
      await r.set(key, JSON.stringify(lesson), 'EX', ttlSec);
      return;
    } catch (e) {
      console.warn('Redis set failed:', e.message || e);
    }
  }
  setCacheLocal(key, lesson, ttlSec * 1000);
}

// Very small per-IP rate limiter (in-memory). In prod, replace with Redis-backed limiter.
const rateLimitMap = new Map();
function checkRateLimit(ip) {
  const now = Date.now();
  const windowMs = 60 * 1000; // 1 minute
  const limit = 20; // requests per window
  const entry = rateLimitMap.get(ip) || { count: 0, reset: now + windowMs };
  if (now > entry.reset) {
    entry.count = 1;
    entry.reset = now + windowMs;
    rateLimitMap.set(ip, entry);
    return;
  }
  entry.count += 1;
  rateLimitMap.set(ip, entry);
  if (entry.count > limit) {
    const retryAfter = Math.ceil((entry.reset - now) / 1000);
    const err = new Error('Rate limit exceeded');
    err.status = 429;
    err.retryAfter = retryAfter;
    throw err;
  }
}

const lessonResponseSchema = {
  type: 'object',
  required: ['learningObjective', 'keyConcepts', 'storyboard', 'memoryAnchors', 'commonMisconceptions', 'finalSummary'],
  additionalProperties: false,
  properties: {
    learningObjective: { type: 'string', minLength: 10 },
    keyConcepts: {
      type: 'array',
      minItems: 2,
      items: { type: 'string', minLength: 3 }
    },
    storyboard: {
      type: 'array',
      minItems: 3,
      items: {
        type: 'object',
        required: ['number', 'duration', 'narration', 'visualDescription', 'animationInstructions', 'onScreenText'],
        additionalProperties: false,
        properties: {
          number: { type: 'integer', minimum: 1 },
          duration: { type: 'integer', minimum: 3, maximum: 20 },
          narration: { type: 'string', minLength: 10 },
          visualDescription: { type: 'string', minLength: 10 },
          animationInstructions: { type: 'string', minLength: 10 },
          onScreenText: { type: 'string', minLength: 1 }
        }
      }
    },
    memoryAnchors: { type: 'string', minLength: 10 },
    commonMisconceptions: { type: 'string', minLength: 10 },
    finalSummary: { type: 'string', minLength: 10 }
  }
};

const ajv = new Ajv({ allErrors: true, strict: false });
const validateLessonResponse = ajv.compile(lessonResponseSchema);

function validateLesson(lesson) {
  const valid = validateLessonResponse(lesson);
  if (!valid) {
    const errors = ajv.errorsText(validateLessonResponse.errors, { separator: '; ' });
    throw new Error(`OpenAI response failed schema validation: ${errors}`);
  }
  return lesson;
}

function generateMockStoryboard(question) {
  const objective = `Explain the idea behind: ${question}`;
  return validateLesson({
    learningObjective: objective,
    keyConcepts: ['Visual explanation', 'Animated storytelling', 'Core idea'],
    storyboard: [
      {
        number: 1,
        duration: 6,
        narration: `Start with the main question and show the concept in a simple visual.`,
        visualDescription: `A large question mark morphing into a simple scene representing the topic.`,
        animationInstructions: `Fade question mark into iconography, then zoom into the concept.`,
        onScreenText: `What is ${question}?`
      },
      {
        number: 2,
        duration: 10,
        narration: `Break the explanation into two or three key ideas with animated comparisons.`,
        visualDescription: `Three cards appear, each with a concise visual for one key concept.`,
        animationInstructions: `Slide cards in from the sides and highlight one at a time.`,
        onScreenText: `Key Concept 1, 2, 3`
      },
      {
        number: 3,
        duration: 8,
        narration: `Show the cause and effect or the core mechanism with motion.`,
        visualDescription: `Flow arrows animate from cause to effect, showing how the topic works.`,
        animationInstructions: `Move arrows and transform shapes to reveal the process.`,
        onScreenText: `How it works`
      }
    ],
    memoryAnchors: `Use a strong visual metaphor to link the idea to a memorable image. For example, ${question} becomes a storybook scene that stays in your mind.`,
    commonMisconceptions: `Avoid assuming the answer is only one simple fact; highlight the common trap visually.`,
    finalSummary: `Review the main concept with a single strong visual and repeat the key takeaway.`
  });
}

function gatherResponseText(completion) {
  if (completion.output_text) {
    return completion.output_text;
  }

  if (!Array.isArray(completion.output)) {
    return '';
  }

  return completion.output
    .map((item) => {
      if (typeof item === 'string') {
        return item;
      }
      if (Array.isArray(item.content)) {
        return item.content.map((chunk) => chunk?.text || '').join('');
      }
      return '';
    })
    .join(' ')
    .trim();
}

async function callOpenAI(question) {
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

  const response = await client.responses.create({
    model: 'gpt-4.1-mini',
    input: [
      {
        role: 'system',
        content: 'You are an expert visual educator and storyboard designer. Return only the exact JSON object defined by the schema with no additional explanation, headers, or markdown.'
      },
      {
        role: 'user',
        content: `Create a concise lesson storyboard for the prompt below. Focus on clean, animation-ready scene structure and valid JSON output.\n\nSchema:\n${JSON.stringify(lessonResponseSchema, null, 2)}\n\nQuestion: ${question}`
      }
    ],
    max_output_tokens: 1200,
    text: {
      format: {
        name: 'lesson_storyboard',
        type: 'json_schema',
        schema: lessonResponseSchema,
        description: 'Structured storyboard output matching the lesson schema',
        strict: true
      }
    }
  });

  const parsed = response.output_parsed ?? (response.output ? JSON.parse(gatherResponseText(response)) : null);
  if (!parsed) {
    throw new Error('OpenAI response was empty or could not be parsed.');
  }

  return validateLesson(parsed);
}

async function callOpenAIWithRetries(question) {
  const maxAttempts = 3;
  let attempt = 0;
  let lastErr = null;
  while (attempt < maxAttempts) {
    try {
      return await callOpenAI(question);
    } catch (err) {
      lastErr = err;
      const status = err?.response?.status || err?.status;
      const transient = status === 502 || status === 503 || status === 429 || /ECONNRESET|ETIMEDOUT|timeout/i.test(String(err?.message || ''));
      attempt += 1;
      if (!transient || attempt >= maxAttempts) break;
      const backoff = Math.pow(2, attempt) * 100 + Math.random() * 100;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }
  throw lastErr;
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.id) {
    return res.status(401).json({ error: 'Unauthorized — please sign in' });
  }

  const { question } = req.body;
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Question is required' });
  }

  const user = await prisma.user.findUnique({ where: { id: session.user.id } });
  if (!user) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    let lesson;
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    try {
      checkRateLimit(ip);
    } catch (rlErr) {
      return res.status(429).json({ error: rlErr.message, retryAfter: rlErr.retryAfter });
    }

    const cacheKey = 'lesson:' + crypto.createHash('sha256').update(question).digest('hex').slice(0, 24);
    const cached = await getCachedLesson(cacheKey);
    if (cached) {
      return res.status(200).json({ ...cached, __cached: true });
    }

    if (process.env.OPENAI_API_KEY) {
      if (user.credits <= 0) {
        return res.status(402).json({ error: 'Insufficient credits. Buy more credits to generate a lesson.' });
      }
      try {
        lesson = await callOpenAIWithRetries(question);
        await setCachedLesson(cacheKey, lesson, 300);
        await prisma.user.update({ where: { id: user.id }, data: { credits: { decrement: 1 } } });
        await prisma.billingEvent.create({ data: { userId: user.id, type: 'lesson_generation', amountCents: 0, credits: 1, currency: 'usd', metadata: JSON.stringify({ question }) } });
      } catch (err) {
        const status = err?.response?.status || err?.status;
        const isQuota = status === 429 || /quota|exceeded|rate limit/i.test(String(err?.message || ''));
        console.error('OpenAI call error:', err?.message || err);
        if (isQuota) {
          console.warn('OpenAI quota exceeded; falling back to mock storyboard.');
          lesson = generateMockStoryboard(question);
          lesson.__warning = 'OpenAI quota exceeded; returned mock storyboard.';
          // cache mock for a short window to avoid repeated calls
          await setCachedLesson(cacheKey, lesson, 60);
        } else {
          throw err;
        }
      }
    } else {
      lesson = generateMockStoryboard(question);
    }

    res.status(200).json(lesson);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
};
