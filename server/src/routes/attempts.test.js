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

// Shell test. Worker B replaces it when building routes/attempts.js.
describe('/api/attempts (shell)', () => {
  it('POST /api/attempts returns 501 NOT_IMPLEMENTED', async () => {
    const res = await request(app)
      .post('/api/attempts')
      .send({
        challengeId: 'find-max',
        userId: null,
        selectedLines: [2],
        explanation: 'max_value počinje od 0 pa negativne liste ne rade.',
        edgeCase: { args: [[-8, -3, -10]], expected: -3 },
        fixedCode: 'def find_max(numbers): ...',
        hintsUsed: 0,
        durationSec: 10,
      });
    expect501(res);
  });

  it('POST /api/attempts does not return tests or the reference solution', async () => {
    const res = await request(app)
      .post('/api/attempts')
      .send({ challengeId: 'find-max' });
    expect501(res);
    expect(res.body.tests).toBeUndefined();
    expect(res.body.referenceSolution).toBeUndefined();
    expect(fake.calls.from).toEqual([]);
  });

  it('POST /api/attempts/:id/evaluation returns 501 NOT_IMPLEMENTED', async () => {
    const res = await request(app)
      .post('/api/attempts/a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d/evaluation')
      .send({ testResults: [], edgeCaseCheck: null });
    expect501(res);
  });

  it('GET /api/attempts returns 501 NOT_IMPLEMENTED', async () => {
    const res = await request(app).get(
      '/api/attempts?userId=x&challengeId=find-max',
    );
    expect501(res);
  });
});
