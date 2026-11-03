import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase({ tables: { challenges: [loadFindMaxRow()] } }).db;

const { app } = await import('../app.js');

// Limits from src/middleware/rateLimit.js. Written hints use only apiLimiter;
// aiLimiter returns to this route when AI hints are wired in batch 2.
const API_LIMIT = 100;
const AI_LIMIT = 20;

const postHint = () =>
  request(app).post('/api/challenges/find-max/hints').send({ level: 1 });

describe('POST /api/challenges/:id/hints rate limit', () => {
  it('is limited by the general API limit only', async () => {
    const first = await postHint();
    expect(first.status).toBe(200);
    // draft-8 header names the policy that applies: the 100 request limit.
    expect(first.headers['ratelimit-policy']).toMatch(
      new RegExp(`q=${API_LIMIT}\\b`),
    );

    // Past the old AI threshold (20) the route still answers.
    for (let i = 1; i <= AI_LIMIT; i += 1) {
      const res = await postHint();
      expect(res.status).toBe(200);
    }

    for (let i = AI_LIMIT + 1; i < API_LIMIT; i += 1) {
      const res = await postHint();
      expect(res.status).toBe(200);
    }

    const res = await postHint();
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
