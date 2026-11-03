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

// Shell test. Worker B replaces it when building routes/progress.js.
describe('GET /api/progress (shell)', () => {
  it('returns 501 NOT_IMPLEMENTED', async () => {
    const res = await request(app).get('/api/progress?userId=abc');
    expect501(res);
  });

  it('returns 501 without a userId too', async () => {
    const res = await request(app).get('/api/progress');
    expect501(res);
  });
});
