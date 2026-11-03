import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeSupabase } from './fakeSupabase.js';
import { CHALLENGES_DIR, collectKeys, expectNoLeak } from './fixtures.js';

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
const fake = createFakeSupabase({
  tables: { challenges: rows, users: [], attempts: [] },
});
state.db = fake.db;

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

describe('contract: attempts, evaluation, progress, users', () => {
  const findMax = rows.find((r) => r.id === 'find-max');
  const body = (extra = {}) => ({
    challengeId: 'find-max',
    userId: null,
    selectedLines: [2],
    explanation: 'max_value počinje od 0 pa negativne liste vraćaju 0.',
    edgeCase: { args: [[-8, -3, -10]], expected: -3 },
    fixedCode: 'def find_max(numbers): return None',
    hintsUsed: 0,
    durationSec: 30,
    ...extra,
  });

  it('POST /api/users -> 201 { id, displayName }', async () => {
    const res = await request(app)
      .post('/api/users')
      .send({ displayName: 'dion' });
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual(['displayName', 'id']);
    envelope(
      await request(app).post('/api/users').send({}),
      400,
      'VALIDATION_ERROR',
    );
  });

  it('POST /api/attempts has exactly the documented fields (the only hidden-data response)', async () => {
    const res = await request(app).post('/api/attempts').send(body());
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'attemptId',
      'referenceSolution',
      'tests',
    ]);
    expect(res.body.referenceSolution).toBe(findMax.reference_solution);
    for (const t of res.body.tests) {
      expect(Object.keys(t).sort()).toEqual([
        'args',
        'expected',
        'id',
        'visible',
      ]);
    }
    const keys = collectKeys(res.body);
    for (const hidden of [
      'bug_lines',
      'related_lines',
      'bug_description',
      'keywords_json',
      'hints_json',
      'fallback_feedback',
      'failsOnOriginal',
    ]) {
      expect(keys.has(hidden)).toBe(false);
    }
    expect(res.text).not.toContain(findMax.bug_description);
    expect(res.text).not.toContain(findMax.fallback_feedback);
  });

  it('error envelopes: attempts 400/404, evaluation 404/409', async () => {
    envelope(
      await request(app).post('/api/attempts').send({}),
      400,
      'VALIDATION_ERROR',
    );
    envelope(
      await request(app)
        .post('/api/attempts')
        .send(body({ challengeId: 'nope' })),
      404,
      'NOT_FOUND',
    );
    const made = await request(app).post('/api/attempts').send(body());
    const url = `/api/attempts/${made.body.attemptId}/evaluation`;
    const ev = {
      testResults: [{ id: 't1', passed: true }],
      edgeCaseCheck: { originalOutput: 0, referenceOutput: -3 },
    };
    const ok = await request(app).post(url).send(ev);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.body).sort()).toEqual([
      'breakdown',
      'feedback',
      'feedbackSource',
      'score',
      'testsPassed',
      'testsTotal',
    ]);
    expect(Object.keys(ok.body.breakdown).sort()).toEqual([
      'edgeCase',
      'explanation',
      'fix',
      'hintPenalty',
      'lineIdentification',
    ]);
    expect(['ai', 'fallback', 'demo']).toContain(ok.body.feedbackSource);
    envelope(await request(app).post(url).send(ev), 409, 'ALREADY_EVALUATED');
    envelope(
      await request(app)
        .post('/api/attempts/33333333-3333-4333-8333-333333333333/evaluation')
        .send(ev),
      404,
      'NOT_FOUND',
    );
  });

  it('GET /api/progress and GET /api/attempts shapes, userId required', async () => {
    const user = await request(app)
      .post('/api/users')
      .send({ displayName: 'ana' });
    const userId = user.body.id;
    const made = await request(app)
      .post('/api/attempts')
      .send(body({ userId }));
    expect(made.status).toBe(201);
    const progress = await request(app).get(`/api/progress?userId=${userId}`);
    expect(progress.status).toBe(200);
    expect(Object.keys(progress.body).sort()).toEqual([
      'attempted',
      'averageDurationSec',
      'perChallenge',
      'solved',
      'totalScore',
      'weakCategories',
    ]);
    expect(progress.body.attempted).toBe(1);
    const list = await request(app).get(`/api/attempts?userId=${userId}`);
    expect(list.status).toBe(200);
    expect(list.body).toHaveLength(1);
    expect(list.text).not.toContain(findMax.reference_solution);
    envelope(await request(app).get('/api/progress'), 400, 'VALIDATION_ERROR');
    envelope(await request(app).get('/api/attempts'), 400, 'VALIDATION_ERROR');
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

  // User decision (see docs/PLAN.md): only attemptService.js and
  // hintService.js may reference getFullChallenge, besides its definition in
  // db/challenges.js. hintService may use it so AI hints can check against
  // hidden data; routes call only services, never the full row. These files
  // may not exist yet; that is fine.
  const GET_FULL_CHALLENGE_ALLOWED = [
    'src/db/challenges.js',
    'src/services/attemptService.js',
    'src/services/hintService.js',
  ];

  // Text tripwires, not a sandbox: they read files as plain text and match
  // patterns, so they catch honest mistakes, not deliberate obfuscation.
  //
  // Scan scope: .js/.mjs/.cjs files under server/ plus server/package.json.
  // Skipped (by path relative to server/): node_modules/, coverage/ and this
  // guard file. Other `test` directories are scanned.
  const serverDir = fileURLToPath(new URL('..', import.meta.url));
  const toPosix = (p) => p.replaceAll(String.fromCharCode(92), '/');
  const SKIP_PREFIXES = ['node_modules/', 'coverage/'];
  const GUARD_FILE = 'test/integration.test.js';
  const SOURCE_EXT = /\.(js|mjs|cjs)$/;
  const isTestPath = (rel) => /\.test\.[^/]+$/.test(rel) || /^test\//.test(rel);

  // Returns { files, hits, scanned }. `files` are all scanned files as
  // { rel, src, isTest }; `scanned` is their relative paths. `hits` are the
  // relative paths of files accepted by `select` whose text satisfies
  // `predicate`.
  const scanServer = (predicate, select = () => true, root = serverDir) => {
    const files = [];
    const walk = (dir) => {
      for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const rel = toPosix(relative(root, p));
        if (statSync(p).isDirectory()) {
          if (!SKIP_PREFIXES.includes(`${rel}/`)) walk(p);
        } else if (
          (SOURCE_EXT.test(name) || rel === 'package.json') &&
          rel !== GUARD_FILE
        ) {
          files.push({
            rel,
            src: readFileSync(p, 'utf8'),
            isTest: isTestPath(rel),
          });
        }
      }
    };
    walk(root);
    const hits = files
      .filter((f) => select(f) && predicate(f.src))
      .map((f) => f.rel);
    return { files, hits, scanned: files.map((f) => f.rel) };
  };

  const isNonTestSourceOrPackage = (f) => f.rel === 'package.json' || !f.isTest;
  const isPackageOrTest = (f) => f.rel === 'package.json' || f.isTest;

  const expectScanCovered = (scanned) => {
    expect(scanned).toContain('src/app.js');
    expect(scanned).toContain('scripts/validate-challenges.js');
    expect(scanned).toContain('package.json');
  };

  it('no route file references getFullChallenge', () => {
    const { hits, scanned } = scanServer(
      (src) => src.includes('getFullChallenge'),
      (f) => !f.isTest && f.rel.startsWith('src/routes/'),
    );
    expectScanCovered(scanned);
    expect(
      hits,
      `routes must not touch the full challenge row, found getFullChallenge in: ${hits}`,
    ).toEqual([]);
  });

  it('getFullChallenge is referenced only by its definition and the allow-listed services', () => {
    const { hits, scanned } = scanServer(
      (src) => src.includes('getFullChallenge'),
      isNonTestSourceOrPackage,
    );
    expectScanCovered(scanned);
    const offenders = hits.filter(
      (h) => !GET_FULL_CHALLENGE_ALLOWED.includes(h),
    );
    expect(
      offenders,
      `forbidden getFullChallenge use in: ${offenders}`,
    ).toEqual([]);
    expect(hits).toContain('src/db/challenges.js');
  });

  // Safety guard: the author tool tools/check-challenge.py never runs from
  // the server. Rule (a): non-test source and package.json must not contain
  // child_process (also matches node:child_process) or check-challenge.
  // Rule (b): package.json and all test files must not contain
  // check-challenge, nor a python word together with a spawn API. Test files
  // may spawn Node itself.
  const mentionsTool = (src) => src.includes('check-challenge');
  const usesChildProcess = (src) => src.includes('child_process');
  const PYTHON_WORD = /\b(python3?|pythonw|py)\b/i;
  const SPAWN_API =
    /child_process|\b(execa|cross-spawn|shelljs|zx)\b|\b(spawn|spawnSync|execSync|execFile|fork)\s*\(/;
  const spawnsPython = (src) => PYTHON_WORD.test(src) && SPAWN_API.test(src);
  const ruleA = (src) => usesChildProcess(src) || mentionsTool(src);
  const ruleB = (src) => mentionsTool(src) || spawnsPython(src);

  it('rule (a): non-test source and package.json have no child_process or check-challenge', () => {
    const { hits, scanned } = scanServer(ruleA, isNonTestSourceOrPackage);
    expectScanCovered(scanned);
    expect(
      hits,
      `child_process or check-challenge in non-test file: ${hits}`,
    ).toEqual([]);
  });

  it('rule (b): package.json and test files have no check-challenge or python spawn', () => {
    const { hits, scanned } = scanServer(ruleB, isPackageOrTest);
    expectScanCovered(scanned);
    expect(
      hits,
      `check-challenge or python spawn in package.json/test file: ${hits}`,
    ).toEqual([]);
  });

  it('matchers: flag python spawns and tool references, allow Node spawns', () => {
    const pkg = '"x": "python ../tools/check-challenge.py"';
    expect(ruleB(pkg)).toBe(true);
    expect(ruleA(pkg)).toBe(true);
    expect(ruleB("spawnSync('python3', ['a.py'])")).toBe(true);
    expect(ruleB("import { exec } from 'zx'; // python")).toBe(true);
    expect(ruleB('spawnSync(process.execPath, [script])')).toBe(false);
    expect(ruleB("const c = { language: 'python' }; /x/.exec(s)")).toBe(false);
    expect(ruleB("execSync('python x.py')")).toBe(true);
    expect(ruleB("require('child_process'); // python")).toBe(true);
    expect(ruleA("import cp from 'node:child_process'")).toBe(true);
  });

  it('scanner: scans top-level test/, skips node_modules and the guard, classes nested test/ as source', () => {
    const { scanned } = scanServer(() => false);
    expect(scanned).toContain('test/fixtures.js');
    expect(scanned.some((p) => p.startsWith('node_modules/'))).toBe(false);
    expect(scanned).not.toContain(GUARD_FILE);
    expect(isTestPath('test/fixtures.js')).toBe(true);
    expect(isTestPath('src/x/test/helper.js')).toBe(false);
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
