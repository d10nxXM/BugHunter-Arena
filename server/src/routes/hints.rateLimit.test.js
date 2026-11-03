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

describe('POST /api/challenges/:id/hints rate limit', () => {
  it('returns 429 RATE_LIMITED after 20 requests', async () => {
    for (let i = 0; i < 20; i += 1) {
      const res = await request(app)
        .post('/api/challenges/find-max/hints')
        .send({ level: 1 });
      expect(res.status).toBe(200);
    }
    const res = await request(app)
      .post('/api/challenges/find-max/hints')
      .send({ level: 1 });
    expect(res.status).toBe(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});
