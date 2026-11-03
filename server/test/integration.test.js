import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './fakeSupabase.js';
import { CHALLENGES_DIR, expectNoLeak } from './fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../src/db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const rows = readdirSync(CHALLENGES_DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    ...JSON.parse(readFileSync(join(CHALLENGES_DIR, f), 'utf8')),
    created_at: '2025-01-01T00:00:00Z',
  }));
state.db = createFakeSupabase({ tables: { challenges: rows } }).db;

const { app } = await import('../src/app.js');
const { evaluateExplanation } =
  await import('../src/services/evaluationService.js');

const envelope = (res, status, code) => {
  expect(res.status).toBe(status);
  expect(res.headers['content-type']).toMatch(/application\/json/);
  expect(Object.keys(res.body)).toEqual(['error']);
  expect(Object.keys(res.body.error).sort()).toEqual(['code', 'message']);
  expect(res.body.error.code).toBe(code);
  expect(typeof res.body.error.message).toBe('string');
};

describe('contract: built endpoints', () => {
  it('GET /api/health shape', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(Object.keys(res.body).sort()).toEqual(['ai', 'demoMode', 'status']);
    expect(res.body.status).toBe('ok');
    expect(['available', 'unavailable', 'demo']).toContain(res.body.ai);
    expect(typeof res.body.demoMode).toBe('boolean');
  });

  it('GET /api/challenges lists every challenge with 5 public keys', async () => {
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(rows.length);
    for (const c of res.body) {
      expect(Object.keys(c).sort()).toEqual(
        ['bugCategory', 'difficulty', 'id', 'language', 'title'].sort(),
      );
    }
  });

  it('GET /api/challenges/:id has the documented keys for every challenge', async () => {
    for (const row of rows) {
      const res = await request(app).get(`/api/challenges/${row.id}`);
      expect(res.status).toBe(200);
      expect(Object.keys(res.body).sort()).toEqual(
        [
          'bugCategory',
          'code',
          'description',
          'difficulty',
          'functionName',
          'hintCount',
          'id',
          'language',
          'title',
          'visibleTests',
        ].sort(),
      );
      expect(res.body.hintCount).toBe(3);
      for (const t of res.body.visibleTests) {
        expect(Object.keys(t).sort()).toEqual(['args', 'expected', 'id']);
      }
    }
  });

  it('error envelopes: 404, 400, 413, 429', async () => {
    envelope(await request(app).get('/api/challenges/nope'), 404, 'NOT_FOUND');
    envelope(await request(app).get('/api/nothing'), 404, 'NOT_FOUND');
    envelope(
      await request(app)
        .post('/api/challenges/find-max/hints')
        .send({ level: 4 }),
      400,
      'VALIDATION_ERROR',
    );
    envelope(
      await request(app)
        .post('/api/challenges/find-max/hints')
        .send({ level: 0 }),
      400,
      'VALIDATION_ERROR',
    );
    envelope(
      await request(app).post('/api/challenges/nope/hints').send({ level: 1 }),
      404,
      'NOT_FOUND',
    );
    envelope(
      await request(app)
        .post('/api/challenges/find-max/hints')
        .send({ level: 1, currentAnswer: 'x'.repeat(60000) }),
      413,
      'PAYLOAD_TOO_LARGE',
    );
  });
});

describe('contract: unbuilt endpoints return 501 NOT_IMPLEMENTED', () => {
  const cases = [
    ['post', '/api/attempts'],
    ['post', '/api/attempts/abc/evaluation'],
    ['get', '/api/attempts'],
    ['get', '/api/progress?userId=u'],
    ['post', '/api/users'],
  ];
  it.each(cases)('%s %s', async (method, path) => {
    const res = await request(app)[method](path).send({});
    envelope(res, 501, 'NOT_IMPLEMENTED');
  });
});

describe('leak: public responses, all challenges', () => {
  it('list, detail and hints never expose hidden data', async () => {
    const list = await request(app).get('/api/challenges');
    for (const row of rows) {
      expectNoLeak(expect, list, row);
      const detail = await request(app).get(`/api/challenges/${row.id}`);
      expect(detail.text).not.toContain(row.reference_solution);
      expect(detail.text).not.toContain(row.bug_description);
      expect(detail.text).not.toContain(row.fallback_feedback);
      for (const h of row.hints_json) expect(detail.text).not.toContain(h);
      for (const level of [1, 2, 3]) {
        const res = await request(app)
          .post(`/api/challenges/${row.id}/hints`)
          .send({ level });
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
          level,
          hint: row.hints_json[level - 1],
          source: 'written',
        });
      }
    }
  });

  it('getFullChallenge has no caller outside its definition and tests', () => {
    const srcDir = fileURLToPath(new URL('../src', import.meta.url));
    const hits = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p);
        else if (p.endsWith('.js') && !p.endsWith('.test.js')) {
          if (readFileSync(p, 'utf8').includes('getFullChallenge'))
            hits.push(
              p.replaceAll(String.fromCharCode(92), '/').split('/src/')[1],
            );
        }
      }
    };
    walk(srcDir);
    expect(hits).toEqual(['db/challenges.js']);
  });
});

describe('parity: fallback stub shape (ai and demo N/A until worker C)', () => {
  it('returns the 8 documented fields with a valid quality', async () => {
    const out = await evaluateExplanation({
      challenge: rows[0],
      answer: { explanation: 'x' },
    });
    expect(Object.keys(out).sort()).toEqual(
      [
        'detected_misconception',
        'explanation_quality',
        'feedback',
        'hint',
        'is_correct',
        'needs_clarification',
        'practice_tip',
        'source',
      ].sort(),
    );
    expect(out.source).toBe('fallback');
    expect(out.detected_misconception).toBeNull();
    expect([0, 3, 7, 10]).toContain(out.explanation_quality);
    expect(out.feedback).toBe(rows[0].fallback_feedback);
  });
});
