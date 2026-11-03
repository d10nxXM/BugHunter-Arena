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

// Shell test. Worker A replaces it when building routes/hints.js.
describe('POST /api/challenges/:id/hints (shell)', () => {
  it('returns 501 NOT_IMPLEMENTED in the error envelope', async () => {
    const res = await request(app)
      .post('/api/challenges/find-max/hints')
      .send({
        level: 1,
        currentAnswer: { selectedLines: [], explanation: '' },
      });
    expect501(res);
  });

  it('does not touch the database or leak hidden challenge data', async () => {
    const res = await request(app)
      .post('/api/challenges/find-max/hints')
      .send({});
    expect501(res);
    expect(fake.calls.from).toEqual([]);
    expect(res.text).not.toMatch(/max_value|numbers\[0\]|Pogledaj/);
  });

  it('leaves GET .../hints unmatched (404)', async () => {
    const res = await request(app).get('/api/challenges/find-max/hints');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });
});
