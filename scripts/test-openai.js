const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env.local'), override: true });
require('dotenv').config({ path: path.resolve(process.cwd(), '.env'), override: true });

const OpenAI = require('openai');
const Ajv = require('ajv');

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
    throw new Error(`Schema validation failed: ${errors}`);
  }
  return lesson;
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

async function runOpenAITest() {
  if (!process.env.OPENAI_API_KEY) {
    console.error('OPENAI_API_KEY is required to run this test.');
    process.exit(1);
  }

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const question = 'What is photosynthesis and how can it be taught visually?';

  console.log('Running gpt-4.1-mini storyboard test for:', question);

  let response;
  try {
    response = await client.responses.create({
      model: 'gpt-4.1-mini',
      input: [
        {
          role: 'system',
          content: 'You are an expert visual educator and storyboard designer. Return only the exact JSON object defined by the schema with no additional explanation, headers, or markdown.'
        },
        {
          role: 'user',
          content: `Create a lesson storyboard using animation-ready scene structure and valid JSON output.\n\nSchema:\n${JSON.stringify(lessonResponseSchema, null, 2)}\n\nQuestion: ${question}`
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
  } catch (err) {
    const status = err?.response?.status || err?.status;
    const isQuota = status === 429 || /quota|exceeded|rate limit/i.test(String(err?.message || ''));
    if (isQuota) {
      console.error('Test failed: OpenAI quota exceeded. Check billing/usage on the OpenAI dashboard.');
      process.exit(2);
    }
    console.error('Test failed while calling OpenAI:', err?.message || err);
    process.exit(1);
  }

  const parsed = response.output_parsed ?? (response.output ? JSON.parse(gatherResponseText(response)) : null);
  if (!parsed) {
    throw new Error('OpenAI response was empty or could not be parsed.');
  }

  validateLesson(parsed);

  console.log('✅ OpenAI response validated successfully.');
  console.log('--- Sample response ---');
  console.log(JSON.stringify(parsed, null, 2));
  console.log('--- Scene preview ---');
  parsed.storyboard.slice(0, 2).forEach((scene) => {
    console.log(`Scene ${scene.number}: ${scene.narration}`);
  });
}

runOpenAITest().catch((error) => {
  console.error('Test failed:', error.message || error);
  process.exit(1);
});
