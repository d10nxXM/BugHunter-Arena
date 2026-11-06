import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from './fakeSupabase.js';
import { loadFindMaxRow } from './fixtures.js';

const state = vi.hoisted(() => ({ db: null, complete: vi.fn() }));
vi.mock('../src/db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
vi.mock('../src/services/llmClient.js', () => ({ complete: state.complete }));

const { app } = await import('../src/app.js');
const { config } = await import('../src/lib/config.js');
const { aiLimiter, apiLimiter } =
  await import('../src/middleware/rateLimit.js');

const row = loadFindMaxRow();
const original = { ...config };
const AI_LIMIT = 20;
const UNKNOWN_ATTEMPT = '33333333-3333-4333-8333-333333333333';

const HINT_REPLY = '{"hint":"What if every number is negative?"}';
const EVAL_REPLY = JSON.stringify({
  explanation_quality: 8,
  detected_misconception: null,
  needs_clarification: false,
  hint: null,
  feedback: 'Good explanation.',
  practice_tip: null,
});

// The fake provider answers by request type: hints ask for 80 output tokens,
// evaluations for 400 (src/services/aiService.js).
function fakeComplete({ maxTokens }) {
  if (maxTokens === 80) return Promise.resolve(HINT_REPLY);
  if (maxTokens === 400) return Promise.resolve(EVAL_REPLY);
  return Promise.reject(new Error(`unexpected maxTokens ${maxTokens}`));
}

function setMode(mode) {
  Object.assign(config, original);
  if (mode === 'ai') {
    Object.assign(config, {
      aiStatus: 'available',
      demoMode: false,
      llmApiKey: 'k',
      llmApiUrl: 'https://llm.example.test/v1',
      llmModel: 'm',
    });
  } else {
    Object.assign(config, { aiStatus: 'unavailable', demoMode: false });
  }
}

const attemptBody = {
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation: 'max_value starts at 0 so negative lists return 0.',
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode: 'def find_max(numbers):\n    return max(numbers, default=None)',
  hintsUsed: 0,
  durationSec: 30,
};
const evalBody = {
  testResults: row.tests_json.map((t) => ({ id: t.id, passed: true })),
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3 },
};

const hint = (id = 'find-max', body = { level: 1 }) =>
  request(app).post(`/api/challenges/${id}/hints`).send(body);
const evaluation = (id, body = evalBody) =>
  request(app).post(`/api/attempts/${id}/evaluation`).send(body);
async function createAttempt() {
  const res = await request(app).post('/api/attempts').send(attemptBody);
  expect(res.status).toBe(201);
  return res.body.attemptId;
}

beforeEach(() => {
  state.db = createFakeSupabase({
    tables: { challenges: [row], users: [], attempts: [] },
  }).db;
  state.complete.mockReset();
  state.complete.mockImplementation(fakeComplete);
  for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::/56']) {
    aiLimiter.resetKey(key);
    apiLimiter.resetKey(key);
  }
});
afterEach(() => {
  Object.assign(config, original);
});

/** 20 AI hints all succeed, then the next one is 429. */
async function expectFullAiQuota() {
  for (let i = 0; i < AI_LIMIT; i += 1) {
    const res = await hint();
    expect(res.status).toBe(200);
    expect(res.body.source).toBe('ai');
  }
  expect((await hint()).status).toBe(429);
}

describe('AI limit: one counter of 20 LLM calls (AI configured)', () => {
  it('hints and evaluations share it, then 429 on both', async () => {
    setMode('ai');
    const ids = [];
    for (let i = 0; i < 11; i += 1) ids.push(await createAttempt());

    for (let i = 0; i < 10; i += 1) {
      const res = await hint();
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('ai');
    }
    for (let i = 0; i < 10; i += 1) {
      const res = await evaluation(ids[i]);
      expect(res.status).toBe(200);
      expect(res.body.feedbackSource).toBe('ai');
    }

    const h = await hint();
    expect(h.status).toBe(429);
    expect(h.body.error.code).toBe('RATE_LIMITED');
    const e = await evaluation(ids[10]);
    expect(e.status).toBe(429);
    expect(e.body.error.code).toBe('RATE_LIMITED');
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);

    // other routes are not under the AI limit
    expect((await request(app).get('/api/health')).status).toBe(200);
  });
});

describe('AI limit: an LLM call that then falls back still uses a slot', () => {
  it('hints: the LLM fails, 20 written hints, then 429', async () => {
    setMode('ai');
    state.complete.mockRejectedValue(new Error('provider down'));
    for (let i = 0; i < AI_LIMIT; i += 1) {
      const res = await hint();
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('written');
    }
    const over = await hint();
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('evaluations: the LLM fails, 20 fallback evaluations, then 429', async () => {
    setMode('ai');
    state.complete.mockRejectedValue(new Error('provider down'));
    const ids = [];
    for (let i = 0; i <= AI_LIMIT; i += 1) ids.push(await createAttempt());
    for (let i = 0; i < AI_LIMIT; i += 1) {
      const res = await evaluation(ids[i]);
      expect(res.status).toBe(200);
      expect(res.body.feedbackSource).toBe('fallback');
    }
    const over = await evaluation(ids[AI_LIMIT]);
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    // A provider error is not retried: one LLM call per evaluation.
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });
});

describe('AI limit: a successful AI call uses one slot', () => {
  it('one AI hint and one AI evaluation leave 18 slots', async () => {
    setMode('ai');
    const id = await createAttempt();
    const h = await hint();
    expect(h.status).toBe(200);
    expect(h.body.source).toBe('ai');
    const e = await evaluation(id);
    expect(e.status).toBe(200);
    expect(e.body.feedbackSource).toBe('ai');

    for (let i = 0; i < AI_LIMIT - 2; i += 1) {
      const res = await hint();
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('ai');
    }
    expect((await hint()).status).toBe(429);
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });
});

describe('AI limit: requests that never call the LLM do not count', () => {
  it('25 hints with a bad body (400)', async () => {
    setMode('ai');
    for (let i = 0; i < 25; i += 1) {
      expect((await hint('find-max', { level: 9 })).status).toBe(400);
    }
    await expectFullAiQuota();
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('25 evaluations with a bad body (400)', async () => {
    setMode('ai');
    for (let i = 0; i < 25; i += 1) {
      expect(
        (await evaluation(UNKNOWN_ATTEMPT, { testResults: [] })).status,
      ).toBe(400);
    }
    await expectFullAiQuota();
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('25 hints for an unknown challenge (404)', async () => {
    setMode('ai');
    for (let i = 0; i < 25; i += 1) {
      expect((await hint('nope')).status).toBe(404);
    }
    await expectFullAiQuota();
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('25 evaluations of an unknown attempt (404)', async () => {
    setMode('ai');
    for (let i = 0; i < 25; i += 1) {
      expect((await evaluation(UNKNOWN_ATTEMPT)).status).toBe(404);
    }
    await expectFullAiQuota();
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('25 re-evaluations of an evaluated attempt (409)', async () => {
    // Evaluate once without the AI, so the setup itself uses no AI slot.
    setMode('none');
    const id = await createAttempt();
    expect((await evaluation(id)).status).toBe(200);

    setMode('ai');
    for (let i = 0; i < 25; i += 1) {
      const res = await evaluation(id);
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_EVALUATED');
    }
    await expectFullAiQuota();
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });
});

describe('AI limit with the AI not configured', () => {
  it('25 fallback evaluations never get 429', async () => {
    setMode('none');
    for (let i = 0; i < 25; i += 1) {
      const id = await createAttempt();
      const res = await evaluation(id);
      expect(res.status).toBe(200);
      expect(res.body.feedbackSource).toBe('fallback');
    }
    expect(state.complete).not.toHaveBeenCalled();
  });
});

describe('general limit', () => {
  it('is 100 per IP for every /api route', async () => {
    const first = await request(app).get('/api/health');
    expect(first.status).toBe(200);
    expect(first.headers['ratelimit-policy']).toMatch(/q=100\b/);
    for (let i = 2; i <= 100; i += 1) {
      expect((await request(app).get('/api/health')).status).toBe(200);
    }
    const over = await request(app).get('/api/health');
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect((await request(app).get('/api/challenges')).status).toBe(429);
  });
});
