import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));
const fake = createFakeSupabase();
state.db = fake.db;

const { app } = await import('../app.js');

const NOT_IMPLEMENTED = {
  error: {
    code: 'NOT_IMPLEMENTED',
    message: 'Ova funkcija još nije dostupna.',
  },
};

function expect501(res) {
  expect(res.status).toBe(501);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(res.body).toEqual(NOT_IMPLEMENTED);
}

// Shell test for routes/users.js (no M2 owner yet).
describe('POST /api/users (shell)', () => {
  it('returns 501 NOT_IMPLEMENTED and does not echo the display name', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ displayName: 'dion-secret' });
    expect501(res);
    expect(res.text).not.toContain('dion-secret');
    expect(fake.calls.from).toEqual([]);
  });

  it('leaves GET /api/users unmatched (404)', async () => {
    const res = await request(app).get('/api/users');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
