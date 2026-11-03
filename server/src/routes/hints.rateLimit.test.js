import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase({
  tables: { challenges: [loadFindMaxRow()] },
}).db;

const { app } = await import('../app.js');

// Limit from src/middleware/rateLimit.js: aiLimiter, 20 per 10 min per IP,
// shared with the evaluation route.
const AI_LIMIT = 20;

const postHint = () =>
  request(app).post('/api/challenges/find-max/hints').send({ level: 1 });

describe('POST /api/challenges/:id/hints rate limit', () => {
  it('is limited by the shared AI limit (20 per 10 minutes)', async () => {
    const first = await postHint();
    expect(first.status).toBe(200);
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
  });
});
