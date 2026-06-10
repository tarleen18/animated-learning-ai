// Demo script: runs the lesson API handler with mock fallback (no OpenAI key)
process.env.OPENAI_API_KEY = '';

const handler = require('../pages/api/lesson.js');

const req = {
  method: 'POST',
  body: {
    question: 'What is photosynthesis and how can it be taught visually?'
  }
};

const res = {
  _status: 200,
  headers: {},
  status(code) { this._status = code; return this; },
  setHeader(k,v) { this.headers[k]=v; },
  json(obj) { console.log('--- Demo mock output (status', this._status || 200, ') ---'); console.log(JSON.stringify(obj, null, 2)); return obj; },
  send(data) { console.log(data); }
};

handler(req, res).catch(err => {
  console.error('Handler error:', err);
  process.exit(1);
});
