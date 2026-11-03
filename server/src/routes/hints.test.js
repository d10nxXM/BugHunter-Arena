import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import { HIDDEN_KEYS, loadFindMaxRow } from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const { app } = await import('../app.js');
const { logger } = await import('../lib/logger.js');

const row = loadFindMaxRow();
let calls;

function install(options) {
  const fake = createFakeSupabase(options);
  state.db = fake.db;
  calls = fake.calls;
}

beforeEach(() => {
  vi.restoreAllMocks();
  install({ tables: { challenges: [row] } });
});

const post = (body, id = 'find-max') =>
  request(app).post(`/api/challenges/${id}/hints`).send(body);

describe('POST /api/challenges/:id/hints', () => {
  it.each([1, 2, 3])('returns the written hint for level %i', async (level) => {
    const res = await post({ level });
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual({
      level,
      hint: row.hints_json[level - 1],
      source: 'written',
    });
  });

  it('has exactly the keys level, hint, source', async () => {
    const res = await post({ level: 2 });
    expect(Object.keys(res.body).sort()).toEqual(['hint', 'level', 'source']);
  });

  it('accepts currentAnswer without echoing it (AI not configured: written hint)', async () => {
    const res = await post({
      level: 1,
      currentAnswer: { selectedLines: [2], explanation: 'ignored text' },
    });
    expect(res.status).toBe(200);
    expect(res.body.hint).toBe(row.hints_json[0]);
    expect(res.text).not.toContain('ignored text');
  });

  it('selects only id and hints_json, never the full row', async () => {
    await post({ level: 1 });
    const cols = calls.selects.map((s) => s.columns.replace(/\s/g, ''));
    expect(cols).toEqual(['id,hints_json']);
    expect(calls.filters).toEqual([
      { table: 'challenges', column: 'id', value: 'find-max' },
    ]);
  });

  it('does not leak any other hidden field or value', async () => {
    const res = await post({ level: 1 });
    for (const key of HIDDEN_KEYS) {
      expect(res.body).not.toHaveProperty(key);
    }
    for (const value of [
      row.reference_solution,
      row.bug_description,
      row.fallback_feedback,
      row.hints_json[1],
      row.hints_json[2],
    ]) {
      expect(res.text).not.toContain(JSON.stringify(value).slice(1, -1));
    }
    expect(res.text).not.toContain('"t3"');
    expect(res.text).not.toContain('"t4"');
  });

  it.each([
    ['level 0', { level: 0 }],
    ['level 4', { level: 4 }],
    ['level -1', { level: -1 }],
    ['string level', { level: '2' }],
    ['float level', { level: 1.5 }],
    ['null level', { level: null }],
    ['missing level', {}],
    ['array body', [1]],
    ['string body', 'level'],
    ['null body', null],
  ])('rejects %s with 400 VALIDATION_ERROR', async (_name, body) => {
    const res = await request(app)
      .post('/api/challenges/find-max/hints')
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body));
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
    expect(typeof res.body.error.message).toBe('string');
    expect(Object.keys(res.body)).toEqual(['error']);
    expect(calls.from).toEqual([]);
  });

  it('rejects a request with no body', async () => {
    const res = await request(app).post('/api/challenges/find-max/hints');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('rejects broken JSON with 400 VALIDATION_ERROR', async () => {
    const res = await request(app)
      .post('/api/challenges/find-max/hints')
      .set('Content-Type', 'application/json')
      .send('{"level":');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('returns 404 NOT_FOUND for an unknown challenge', async () => {
    const res = await post({ level: 1 }, 'does-not-exist');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 400 for an invalid challenge id', async () => {
    const res = await post({ level: 1 }, 'BAD_ID');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('leaves GET .../hints unmatched (404)', async () => {
    const res = await request(app).get('/api/challenges/find-max/hints');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 500 INTERNAL_ERROR on a db error without leaking', async () => {
    install({
      error: { message: 'db exploded at secret-host', code: 'XX000' },
    });
    const res = await post({ level: 1 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('exploded');
    expect(res.text).not.toContain('secret-host');
    expect(res.text).not.toContain('XX000');
  });

  it('returns 500 when the stored hints are malformed', async () => {
    install({
      tables: { challenges: [{ ...row, hints_json: ['only one'] }] },
    });
    const res = await post({ level: 3 });
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
  });

  it('does not log the request body', async () => {
    install({ error: { message: 'boom', code: 'XX000' } });
    const spy = vi.spyOn(logger, 'error').mockImplementation(() => {});
    await post({
      level: 1,
      currentAnswer: { explanation: 'SECRET-STUDENT-TEXT' },
    });
    expect(JSON.stringify(spy.mock.calls)).not.toContain('SECRET-STUDENT-TEXT');
  });
});

describe('hint level contract (order not enforced)', () => {
  const hintOf = (level) => row.hints_json[level - 1];
  const escaped = (level) => JSON.stringify(hintOf(level)).slice(1, -1);

  it('serves level 3 as the very first request', async () => {
    const res = await post({ level: 3 });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      level: 3,
      hint: row.hints_json[2],
      source: 'written',
    });
  });

  it('serves concurrent level 1 and level 2 requests independently', async () => {
    const [r1, r2] = await Promise.all([
      post({ level: 1 }),
      post({ level: 2 }),
    ]);
    expect(r1.status).toBe(200);
    expect(r2.status).toBe(200);
    expect(r1.body).toEqual({ level: 1, hint: hintOf(1), source: 'written' });
    expect(r2.body).toEqual({ level: 2, hint: hintOf(2), source: 'written' });
  });

  it.each([1, 2, 3])(
    'level %i response holds only its own hint text',
    async (level) => {
      const res = await post({ level });
      expect(res.text).toContain(escaped(level));
      for (const other of [1, 2, 3].filter((l) => l !== level)) {
        expect(res.text).not.toContain(escaped(other));
      }
    },
  );

  it.each([0, 4, 1.5, '1'])('rejects level %j with 400', async (level) => {
    const res = await post({ level });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('VALIDATION_ERROR');
  });
});
