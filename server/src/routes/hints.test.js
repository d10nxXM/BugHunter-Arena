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

  it('accepts and ignores currentAnswer', async () => {
    const res = await post({
      level: 1,
      currentAnswer: { selectedLines: [2], explanation: 'ignored text' },
    });
    expect(res.status).toBe(200);
    expect(res.body.hint).toBe(row.hints_json[0]);
    expect(res.text).not.toContain('ignored text');
  });

  it('does not enforce level = hints used + 1', async () => {
    const res = await post({ level: 3 });
    expect(res.status).toBe(200);
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
    expect(JSON.stringify(spy.mock.calls)).not.toContain(
      'SECRET-STUDENT-TEXT',
    );
  });
});
