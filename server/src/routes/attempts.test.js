import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const USER_ID = '11111111-1111-4111-8111-111111111111';
const challenge = loadFindMaxRow();
const fake = createFakeSupabase({
  tables: {
    challenges: [challenge],
    users: [{ id: USER_ID, display_name: 'dion' }],
    attempts: [],
  },
});
state.db = fake.db;

const { app } = await import('../app.js');

const attemptBody = (overrides = {}) => ({
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation:
    'max_value počinje od 0 pa negativne liste vraćaju 0, a to nije u listi.',
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode: 'def find_max(numbers):\n    return max(numbers, default=None)',
  hintsUsed: 1,
  durationSec: 184,
  ...overrides,
});

const evalBody = (passed = true) => ({
  testResults: challenge.tests_json.map((t) => ({ id: t.id, passed })),
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null },
});

const create = (body = attemptBody()) =>
  request(app).post('/api/attempts').send(body);

describe('POST /api/attempts', () => {
  it('stores the attempt first, then returns exactly the documented fields', async () => {
    const res = await create(attemptBody({ userId: USER_ID }));
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'attemptId',
      'referenceSolution',
      'tests',
    ]);
    expect(res.body.referenceSolution).toBe(challenge.reference_solution);
    expect(res.body.tests).toHaveLength(4);
    for (const t of res.body.tests) {
      expect(Object.keys(t).sort()).toEqual([
        'args',
        'expected',
        'id',
        'visible',
      ]);
    }
    expect(res.body.tests.map((t) => t.visible)).toEqual([
      true,
      true,
      false,
      false,
    ]);

    const stored = fake.tables.attempts.find(
      (a) => a.id === res.body.attemptId,
    );
    expect(stored).toMatchObject({
      status: 'submitted',
      user_id: USER_ID,
      challenge_id: 'find-max',
      hints_used: 1,
      duration: 184,
      selected_lines: [2],
    });
  });

  it('stores fixedCode as text and rounds a fractional duration', async () => {
    const res = await create(
      attemptBody({
        fixedCode: "__import__('os').system('x')",
        durationSec: 1.6,
      }),
    );
    expect(res.status).toBe(201);
    const stored = fake.tables.attempts.find(
      (a) => a.id === res.body.attemptId,
    );
    expect(stored.fixed_code).toBe("__import__('os').system('x')");
    expect(stored.duration).toBe(2);
  });

  it('clamps a huge duration to the int column range', async () => {
    const res = await create(attemptBody({ durationSec: 1e12 }));
    expect(res.status).toBe(201);
    const stored = fake.tables.attempts.find(
      (a) => a.id === res.body.attemptId,
    );
    expect(stored.duration).toBe(2147483647);
  });

  it('404 for an unknown challenge, nothing stored', async () => {
    const before = fake.tables.attempts.length;
    const res = await create(attemptBody({ challengeId: 'nope' }));
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.tests).toBeUndefined();
    expect(fake.tables.attempts).toHaveLength(before);
  });

  it('404 for an unknown user, nothing stored, no hidden data', async () => {
    const before = fake.tables.attempts.length;
    const res = await create(
      attemptBody({ userId: '22222222-2222-4222-8222-222222222222' }),
    );
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.text).not.toContain(challenge.reference_solution);
    expect(fake.tables.attempts).toHaveLength(before);
  });

  it('404 when the database reports a foreign key violation', async () => {
    const own = createFakeSupabase({
      tables: { challenges: [challenge], users: [{ id: USER_ID }] },
      insertError: { code: '23503', message: 'fk' },
    });
    const prev = state.db;
    state.db = own.db;
    try {
      const res = await create(attemptBody({ userId: USER_ID }));
      expect(res.status).toBe(404);
      expect(res.text).not.toContain(challenge.reference_solution);
    } finally {
      state.db = prev;
    }
  });

  it('a foreign key violation without a userId is a 500, not "user missing"', async () => {
    const own = createFakeSupabase({
      tables: { challenges: [challenge] },
      insertError: { code: '23503', message: 'fk' },
    });
    const prev = state.db;
    state.db = own.db;
    try {
      const res = await create(attemptBody({ userId: null }));
      expect(res.status).toBe(500);
    } finally {
      state.db = prev;
    }
  });

  it('500 without hidden data when the insert fails', async () => {
    const own = createFakeSupabase({
      tables: { challenges: [challenge] },
      insertError: { code: 'XX000', message: 'boom' },
    });
    const prev = state.db;
    state.db = own.db;
    try {
      const res = await create();
      expect(res.status).toBe(500);
      expect(res.text).not.toContain(challenge.reference_solution);
      expect(res.body.tests).toBeUndefined();
    } finally {
      state.db = prev;
    }
  });

  it.each([
    ['empty explanation', { explanation: '' }],
    ['short explanation', { explanation: 'x'.repeat(19) }],
    ['long explanation', { explanation: 'x'.repeat(1001) }],
    ['no lines', { selectedLines: [] }],
    ['too many lines', { selectedLines: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] }],
    ['long fixedCode', { fixedCode: 'x'.repeat(5001) }],
    ['hints 4', { hintsUsed: 4 }],
    ['negative duration', { durationSec: -1 }],
    ['bad userId', { userId: 'abc' }],
  ])('400 for %s', async (_name, overrides) => {
    const res = await create(attemptBody(overrides));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(res.body.tests).toBeUndefined();
  });
});

describe('POST /api/attempts/:id/evaluation', () => {
  it('scores the worked example and locks the attempt (second call 409)', async () => {
    const { body: made } = await create();
    const first = await request(app)
      .post(`/api/attempts/${made.attemptId}/evaluation`)
      .send(evalBody());
    expect(first.status).toBe(200);
    expect(Object.keys(first.body).sort()).toEqual([
      'breakdown',
      'feedback',
      'feedbackSource',
      'score',
      'testsPassed',
      'testsTotal',
    ]);
    // lines 40 + explanation (groups: inicijaliz? "počinje od 0" -> 'negativ' + ... )
    expect(first.body.breakdown.lineIdentification).toBe(40);
    expect(first.body.breakdown.edgeCase).toBe(20);
    expect(first.body.breakdown.fix).toBe(10);
    expect(first.body.breakdown.hintPenalty).toBe(-5);
    expect(first.body.testsPassed).toBe(4);
    expect(first.body.testsTotal).toBe(4);
    expect(first.body.feedbackSource).toBe('fallback');
    expect(Object.keys(first.body.feedback).sort()).toEqual([
      'detected_misconception',
      'explanation_quality',
      'feedback',
      'hint',
      'is_correct',
      'needs_clarification',
      'practice_tip',
    ]);
    const b = first.body.breakdown;
    expect(first.body.score).toBe(
      b.lineIdentification + b.explanation + b.edgeCase + b.fix + b.hintPenalty,
    );

    const stored = fake.tables.attempts.find((a) => a.id === made.attemptId);
    expect(stored.status).toBe('evaluated');
    expect(stored.score).toBe(first.body.score);
    expect(stored.feedback_source).toBe('fallback');

    const second = await request(app)
      .post(`/api/attempts/${made.attemptId}/evaluation`)
      .send(evalBody());
    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('ALREADY_EVALUATED');
    expect(
      fake.tables.attempts.find((a) => a.id === made.attemptId).score,
    ).toBe(first.body.score);
  });

  it('is race-safe: two concurrent evaluations give one 200 and one 409', async () => {
    const { body: made } = await create();
    const url = `/api/attempts/${made.attemptId}/evaluation`;
    const [a, b] = await Promise.all([
      request(app).post(url).send(evalBody()),
      request(app).post(url).send(evalBody()),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('a conditional update that matches nothing means 409', async () => {
    const { body: made } = await create();
    const row = fake.tables.attempts.find((a) => a.id === made.attemptId);
    const orig = fake.db.from;
    // Another request evaluates between our read and our write.
    state.db = {
      from(table) {
        const chain = orig(table);
        if (table === 'attempts') {
          const update = chain.update.bind(chain);
          chain.update = (patch) => {
            row.status = 'evaluated';
            return update(patch);
          };
        }
        return chain;
      },
    };
    try {
      const res = await request(app)
        .post(`/api/attempts/${made.attemptId}/evaluation`)
        .send(evalBody());
      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe('ALREADY_EVALUATED');
      expect(row.score).toBeUndefined();
    } finally {
      state.db = fake.db;
    }
  });

  it('404 for an unknown attempt', async () => {
    const res = await request(app)
      .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
      .send(evalBody());
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('400 for a bad id, missing edgeCaseCheck and too many results', async () => {
    const bad = await request(app)
      .post('/api/attempts/not-a-uuid/evaluation')
      .send(evalBody());
    expect(bad.status).toBe(400);
    const missing = await request(app)
      .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
      .send({ testResults: [] });
    expect(missing.status).toBe(400);
    const many = await request(app)
      .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
      .send({
        testResults: Array.from({ length: 101 }, (_, i) => ({
          id: `t${i}`,
          passed: true,
        })),
        edgeCaseCheck: { originalOutput: 0, referenceOutput: 0 },
      });
    expect(many.status).toBe(400);
  });

  it('applies the AI rate limit (429 after 20 requests)', async () => {
    let last;
    for (let i = 0; i < 21; i += 1) {
      last = await request(app)
        .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
        .send(evalBody());
      if (last.status === 429) break;
    }
    expect(last.status).toBe(429);
    expect(last.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('GET /api/attempts', () => {
  it('requires a userId', async () => {
    const res = await request(app).get('/api/attempts');
    expect(res.status).toBe(400);
  });

  it('lists summaries of one user without student text or hidden data', async () => {
    const res = await request(app).get(
      `/api/attempts?userId=${USER_ID}&challengeId=find-max`,
    );
    expect(res.status).toBe(200);
    expect(res.body.length).toBeGreaterThan(0);
    for (const item of res.body) {
      expect(Object.keys(item).sort()).toEqual([
        'breakdown',
        'challengeId',
        'createdAt',
        'durationSec',
        'feedbackSource',
        'hintsUsed',
        'id',
        'score',
        'status',
      ]);
    }
    expect(res.text).not.toContain(challenge.reference_solution);
    expect(res.text).not.toContain('počinje od 0');
  });

  it('500 when the database fails', async () => {
    const prev = state.db;
    state.db = createFakeSupabase({ error: { message: 'secret detail' } }).db;
    try {
      const res = await request(app).get(`/api/attempts?userId=${USER_ID}`);
      expect(res.status).toBe(500);
      expect(res.text).not.toContain('secret detail');
    } finally {
      state.db = prev;
    }
  });

  it('returns an empty list for another challenge', async () => {
    const res = await request(app).get(
      `/api/attempts?userId=${USER_ID}&challengeId=other`,
    );
    expect(res.body).toEqual([]);
  });
});
