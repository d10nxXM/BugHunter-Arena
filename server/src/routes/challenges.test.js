import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';
import {
  API_DETAIL_EXAMPLE,
  API_LIST_EXAMPLE,
  expectNoLeak,
  loadFindMaxRow,
} from '../../test/fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const { app } = await import('../app.js');

const row = loadFindMaxRow();
let calls;

function install(options) {
  const fake = createFakeSupabase(options);
  state.db = fake.db;
  calls = fake.calls;
}

beforeEach(() => {
  install({ tables: { challenges: [row] } });
});

describe('GET /api/challenges', () => {
  it('returns the list from API.md', async () => {
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/application\/json/);
    expect(res.body).toEqual(API_LIST_EXAMPLE);
  });

  it('returns an empty array when there are no challenges', async () => {
    install({ tables: { challenges: [] } });
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('returns 500 INTERNAL_ERROR on a db error without leaking the error text', async () => {
    install({
      error: { message: 'db exploded at secret-host', code: 'XX000' },
    });
    const res = await request(app).get('/api/challenges');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('exploded');
    expect(res.text).not.toContain('secret-host');
    expect(res.text).not.toContain('XX000');
  });

  it('does not leak hidden keys or values', async () => {
    const res = await request(app).get('/api/challenges');
    expectNoLeak(expect, res, row);
  });
});

describe('GET /api/challenges/:id', () => {
  it('returns the detail from API.md', async () => {
    const res = await request(app).get('/api/challenges/find-max');
    expect(res.status).toBe(200);
    expect(res.body).toEqual(API_DETAIL_EXAMPLE);
  });

  it('returns visibleTests with ids exactly t1 and t2 and hintCount 3', async () => {
    const res = await request(app).get('/api/challenges/find-max');
    expect(res.body.visibleTests.map((t) => t.id)).toEqual(['t1', 't2']);
    expect(res.body.hintCount).toBe(3);
  });

  it('returns 404 NOT_FOUND for an unknown but well-formed id', async () => {
    const res = await request(app).get('/api/challenges/nope');
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe('NOT_FOUND');
    expect(res.body.error.message).toBeTypeOf('string');
  });

  it.each(['Bad_ID', 'UPPER', 'a'.repeat(65), 'has.dot'])(
    'returns 400 VALIDATION_ERROR for the malformed id "%s" without querying the db',
    async (id) => {
      const res = await request(app).get(`/api/challenges/${id}`);
      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('VALIDATION_ERROR');
      expect(calls.from).toEqual([]);
    },
  );

  it('returns 500 INTERNAL_ERROR on a db error without leaking the error text', async () => {
    install({
      error: { message: 'db exploded at secret-host', code: 'XX000' },
    });
    const res = await request(app).get('/api/challenges/find-max');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('exploded');
    expect(res.text).not.toContain('secret-host');
    expect(res.text).not.toContain('XX000');
  });

  it('does not leak hidden keys or values', async () => {
    const res = await request(app).get('/api/challenges/find-max');
    expect(res.status).toBe(200);
    expectNoLeak(expect, res, row);
  });

  it('does not leak even when the stored row carries extra columns', async () => {
    install({
      tables: {
        challenges: [
          {
            ...row,
            hint_override: 'SECRET-EXTRA',
            solution_notes: 'SECRET-EXTRA',
          },
        ],
      },
    });
    const res = await request(app).get('/api/challenges/find-max');
    expect(res.status).toBe(200);
    expect(res.text).not.toContain('SECRET-EXTRA');
  });
});

describe('public routes never expose hidden challenge data', () => {
  const FORBIDDEN = [
    'reference_solution',
    'bug_lines',
    'related_lines',
    'bug_description',
    'keywords_json',
    'hints_json',
    'fallback_feedback',
    'failsOnOriginal',
    '"t3"',
    '"t4"',
  ];

  it.each(['/api/challenges', '/api/challenges/find-max'])(
    '%s contains no forbidden key or hidden test',
    async (path) => {
      const res = await request(app).get(path);
      expect(res.status).toBe(200);
      for (const word of FORBIDDEN) {
        expect(res.text).not.toContain(word);
      }
    },
  );

  it('never selects a hidden column or the full row', async () => {
    await request(app).get('/api/challenges');
    await request(app).get('/api/challenges/find-max');
    expect(calls.selects.length).toBeGreaterThan(0);
    for (const { columns } of calls.selects) {
      expect(columns).not.toBe('*');
      for (const hidden of FORBIDDEN.slice(0, 7)) {
        expect(columns).not.toContain(hidden);
      }
    }
  });
});

describe('response schemas are strict (a leak fails loudly)', () => {
  afterEach(() => {
    vi.doUnmock('../services/challengeService.js');
    vi.resetModules();
  });

  async function appWithService(service) {
    vi.resetModules();
    vi.doMock('../services/challengeService.js', () => service);
    const mod = await import('../app.js');
    return mod.app;
  }

  it('returns 500 and leaks nothing when the list item has an extra field', async () => {
    const leaky = await appWithService({
      listPublic: async () => [
        { ...API_LIST_EXAMPLE[0], referenceSolution: 'SECRET_SOLUTION' },
      ],
      getPublic: async () => API_DETAIL_EXAMPLE,
    });
    const res = await request(leaky).get('/api/challenges');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('SECRET_SOLUTION');
    expect(res.text).not.toContain('referenceSolution');
  });

  it('returns 500 and leaks nothing when the detail has an extra field', async () => {
    const leaky = await appWithService({
      listPublic: async () => API_LIST_EXAMPLE,
      getPublic: async () => ({
        ...API_DETAIL_EXAMPLE,
        referenceSolution: 'SECRET_SOLUTION',
      }),
    });
    const res = await request(leaky).get('/api/challenges/find-max');
    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe('INTERNAL_ERROR');
    expect(res.text).not.toContain('SECRET_SOLUTION');
    expect(res.text).not.toContain('referenceSolution');
  });

  it('returns 500 when a visible test carries the "visible" flag', async () => {
    const leaky = await appWithService({
      listPublic: async () => API_LIST_EXAMPLE,
      getPublic: async () => ({
        ...API_DETAIL_EXAMPLE,
        visibleTests: [
          { id: 't3', args: [[-8, -3, -10]], expected: -3, visible: false },
        ],
      }),
    });
    const res = await request(leaky).get('/api/challenges/find-max');
    expect(res.status).toBe(500);
    expect(res.text).not.toContain('t3');
    expect(res.text).not.toContain('-10');
  });
});
