import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from './fakeSupabase.js';
import { loadFindMaxRow } from './fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../src/db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
state.db = createFakeSupabase({
  tables: { challenges: [loadFindMaxRow()], users: [], attempts: [] },
}).db;

const { app } = await import('../src/app.js');

const hint = () =>
  request(app).post('/api/challenges/find-max/hints').send({ level: 1 });
const evaluation = () =>
  request(app)
    .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
    .send({
      testResults: [{ id: 't1', passed: true }],
      edgeCaseCheck: { originalOutput: 0, referenceOutput: -3 },
    });

describe('rate limits (fresh module registry per test file)', () => {
  it('hints and evaluation share one aiLimiter counter of 20, then 429 on both', async () => {
    for (let i = 0; i < 10; i += 1) expect((await hint()).status).toBe(200);
    for (let i = 0; i < 10; i += 1)
      expect((await evaluation()).status).toBe(404);
    const h = await hint();
    expect(h.status).toBe(429);
    expect(h.body.error.code).toBe('RATE_LIMITED');
    const e = await evaluation();
    expect(e.status).toBe(429);
    expect(e.body.error.code).toBe('RATE_LIMITED');
    // other routes are not under the AI limit
    expect((await request(app).get('/api/health')).status).toBe(200);
  });

  it('the general limit is 100 per IP for every /api route', async () => {
    // Already counted in the previous test: 20 AI + 2 rejected + 1 health = 23.
    const used = 23;
    const first = await request(app).get('/api/health');
    expect(first.headers['ratelimit-policy']).toMatch(/q=100\b/);
    for (let i = used + 2; i <= 100; i += 1) {
      const res = await request(app).get('/api/health');
      expect(res.status).toBe(200);
    }
    const over = await request(app).get('/api/health');
    expect(over.status).toBe(429);
    expect(over.body.error.code).toBe('RATE_LIMITED');
    expect((await request(app).get('/api/challenges')).status).toBe(429);
  });
});
