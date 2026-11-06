import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null, complete: vi.fn() }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
vi.mock('../services/llmClient.js', () => ({ complete: state.complete }));

const { app } = await import('../app.js');
const { config } = await import('../lib/config.js');
const { aiLimiter, apiLimiter } = await import('../middleware/rateLimit.js');

// Limit from src/middleware/rateLimit.js: aiLimiter, 20 LLM calls per 10 min
// per IP, shared with the evaluation route.
const AI_LIMIT = 20;
const original = { ...config };

const postHint = () =>
  request(app).post('/api/challenges/find-max/hints').send({ level: 1 });

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
  } else if (mode === 'demo') {
    Object.assign(config, { aiStatus: 'demo', demoMode: true });
  } else {
    Object.assign(config, { aiStatus: 'unavailable', demoMode: false });
  }
}

beforeEach(() => {
  state.complete.mockReset();
  state.complete.mockResolvedValue(
    '{"hint":"What if every number is negative?"}',
  );
  state.db = createFakeSupabase({
    tables: { challenges: [loadFindMaxRow()] },
  }).db;
  for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::/56']) {
    aiLimiter.resetKey(key);
    apiLimiter.resetKey(key);
  }
});
afterEach(() => {
  Object.assign(config, original);
});

describe('POST /api/challenges/:id/hints rate limit', () => {
  it('AI configured: 20 AI hints pass, the 21st is 429', async () => {
    setMode('ai');
    const first = await postHint();
    expect(first.status).toBe(200);
    expect(first.body.source).toBe('ai');
    // draft-8 header names the strictest policy; both counters are sent.
    expect(first.headers['ratelimit-policy']).toMatch(
      new RegExp(`q=${AI_LIMIT}\\b`),
    );
    for (let i = 1; i < AI_LIMIT; i += 1) {
      const res = await postHint();
      expect(res.status).toBe(200);
    }
    const res = await postHint();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
    expect(state.complete).toHaveBeenCalledTimes(AI_LIMIT);
  });

  it('AI not configured: 30 written hints never hit the AI limit', async () => {
    setMode('none');
    for (let i = 0; i < 30; i += 1) {
      const res = await postHint();
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('written');
    }
    expect(state.complete).not.toHaveBeenCalled();
  });

  it('demo mode: 30 recorded hints, all 200 with source "demo"', async () => {
    setMode('demo');
    for (let i = 0; i < 30; i += 1) {
      const res = await postHint();
      expect(res.status).toBe(200);
      expect(res.body.source).toBe('demo');
    }
    expect(state.complete).not.toHaveBeenCalled();
  });
});
