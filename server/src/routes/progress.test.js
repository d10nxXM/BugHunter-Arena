import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const U = '11111111-1111-4111-8111-111111111111';
const attempt = (challenge_id, score, extra = {}) => ({
  id: crypto.randomUUID(),
  user_id: U,
  challenge_id,
  status: 'evaluated',
  score,
  score_breakdown: { lineIdentification: 40 },
  duration: 100,
  hints_used: 0,
  created_at: '2025-01-01T00:00:00Z',
  ...extra,
});
const fake = createFakeSupabase({
  tables: {
    challenges: [
      { id: 'a', bug_category: 'Kategorija A' },
      { id: 'b', bug_category: 'Kategorija B' },
    ],
    attempts: [
      attempt('a', 50),
      attempt('a', 80, { duration: 200 }),
      attempt('b', 40, { score_breakdown: { lineIdentification: 0 } }),
      attempt('b', null, { status: 'submitted', score_breakdown: null }),
      attempt('a', 99, { user_id: '99999999-9999-4999-8999-999999999999' }),
    ],
  },
});
state.db = fake.db;
const { app } = await import('../app.js');

describe('GET /api/progress', () => {
  it('computes the dashboard from the attempts table', async () => {
    const res = await request(app).get(`/api/progress?userId=${U}`);
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalScore: 120,
      solved: 1,
      attempted: 2,
      averageDurationSec: 200,
      perChallenge: [
        { challengeId: 'a', bestScore: 80, attempts: 2 },
        { challengeId: 'b', bestScore: 40, attempts: 2 },
      ],
      weakCategories: [
        { category: 'Kategorija A', misses: 1 },
        { category: 'Kategorija B', misses: 1 },
      ],
    });
  });

  it('returns 200 with zeros for an unknown user', async () => {
    const res = await request(app).get(
      '/api/progress?userId=22222222-2222-4222-8222-222222222222',
    );
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      totalScore: 0,
      solved: 0,
      attempted: 0,
      averageDurationSec: 0,
      perChallenge: [],
      weakCategories: [],
    });
  });

  it('reads at most 1000 attempts of the user', async () => {
    const before = fake.calls.limits.length;
    const res = await request(app).get(`/api/progress?userId=${U}`);
    expect(res.status).toBe(200);
    expect(fake.calls.limits.slice(before)).toEqual([
      { table: 'attempts', limit: 1000 },
    ]);
  });

  it('400 without or with an invalid userId', async () => {
    expect((await request(app).get('/api/progress')).status).toBe(400);
    expect((await request(app).get('/api/progress?userId=abc')).status).toBe(
      400,
    );
  });
});
