// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as f from './fixtures.js';
import { mockRequest, resetMocks } from './index.js';

const apiDoc = readFileSync(
  fileURLToPath(new URL('../../../../docs/API.md', import.meta.url)),
  'utf8',
);

/** Every ```json block in docs/API.md, in document order, parsed. */
const docBlocks = [...apiDoc.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => JSON.parse(m[1]));

// One entry per ```json block in docs/API.md, in the same order.
const BLOCK_FIXTURES = [
  ['GET /api/health', f.health],
  ['GET /healthz', f.healthz],
  ['GET /api/challenges', f.challengeList],
  ['GET /api/challenges/:id', f.findMaxPublic],
  ['hint request', f.hintRequest],
  ['hint response', f.hintLevel1],
  ['attempt request', f.attemptRequest],
  ['attempt created', f.attemptCreated],
  ['evaluation request', f.evaluationRequest],
  ['evaluation response', f.evaluationAi],
  ['GET /api/progress', f.progress],
  ['GET /api/attempts', f.attemptsPage],
];

/**
 * Shape of a JSON value: strings become 'string' (the doc examples are Montenegrin, the fixtures
 * English), everything else is kept, so keys, numbers, booleans, nulls and array lengths must match.
 */
function shape(value) {
  if (typeof value === 'string') return 'string';
  if (Array.isArray(value)) return value.map(shape);
  if (value !== null && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, shape(v)]));
  }
  return value;
}

/** Inline `{ ... }` JSON examples in the doc text that contain the given marker. */
function inlineExample(marker) {
  const match = [...apiDoc.matchAll(/`(\{[^`]*\})`/g)].find((m) => m[1].includes(marker));
  return match ? JSON.parse(match[1]) : undefined;
}

describe('fixtures have the shape of docs/API.md', () => {
  it('has one fixture per JSON block', () => {
    expect(docBlocks).toHaveLength(BLOCK_FIXTURES.length);
  });

  it.each(BLOCK_FIXTURES.map(([name, fixture], i) => [name, fixture, i]))(
    '%s',
    (_name, fixture, index) => {
      expect(shape(fixture)).toEqual(shape(docBlocks[index]));
    },
  );

  it('error envelope example', () => {
    const example = inlineExample('"VALIDATION_ERROR"');
    expect(shape(f.errorValidation)).toEqual(shape(example));
    expect(f.errorValidation.error.code).toBe(example.error.code);
  });

  it('empty progress example', () => {
    expect(f.progressEmpty).toEqual(inlineExample('"totalScore": 0'));
  });

  it('user request and response examples', () => {
    expect(shape(f.userRequest)).toEqual(shape(inlineExample('{ "displayName"')));
    const created = inlineExample('"id": "uuid"');
    expect(Object.keys(f.userCreated).sort()).toEqual(Object.keys(created).sort());
    expect(f.userCreated.displayName).toBe(created.displayName);
  });
});

describe('English content', () => {
  it('uses the English difficulty and category', () => {
    expect(f.challengeList[0]).toMatchObject({
      difficulty: 'easy',
      bugCategory: 'Wrong initialization',
    });
    expect(f.findMaxPublic.difficulty).toBe('easy');
  });

  it.each([
    [1, f.hintLevel1],
    [2, f.hintLevel2],
    [3, f.hintLevel3],
  ])('hint level %i is a written hint', (level, fixture) => {
    expect(fixture).toEqual({ level, hint: expect.any(String), source: 'written' });
    expect(fixture.hint.length).toBeGreaterThan(10);
  });
});

describe('fallback evaluation follows docs/SCORING.md', () => {
  // docs/SCORING.md "Fallback without the AI": groups matched -> quality.
  const QUALITY_BY_GROUPS = [0, 3, 7, 10];

  it('quality, explanation points, is_correct and total agree', () => {
    const { feedback, breakdown } = f.evaluationFallback;
    const quality = feedback.explanation_quality;

    expect(f.evaluationFallback.feedbackSource).toBe('fallback');
    expect(QUALITY_BY_GROUPS).toContain(quality);
    expect(feedback).toEqual({
      is_correct: quality >= 7,
      explanation_quality: quality,
      detected_misconception: null,
      needs_clarification: false,
      hint: null,
      feedback: expect.any(String),
      practice_tip: null,
    });
    expect(breakdown.explanation).toBe(Math.round(quality * 3));
    // Same deterministic components and hint penalty as the AI worked example.
    expect({ ...breakdown, explanation: undefined }).toEqual({
      ...f.evaluationAi.breakdown,
      explanation: undefined,
    });
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(f.evaluationFallback.score).toBe(Math.min(100, Math.max(0, sum)));
    expect(Object.keys(feedback).sort()).toEqual(Object.keys(f.evaluationAi.feedback).sort());
  });
});

describe('hidden fields', () => {
  const HIDDEN = [
    'referenceSolution',
    'reference_solution',
    'bug_lines',
    'bugLines',
    'related_lines',
    'bug_description',
    'keywords_json',
    'hints_json',
    'fallback_feedback',
    '"t3"',
    '"t4"',
  ];
  const PUBLIC_FIXTURES = {
    health: f.health,
    challengeList: f.challengeList,
    findMaxPublic: f.findMaxPublic,
    hintLevel1: f.hintLevel1,
    hintLevel2: f.hintLevel2,
    hintLevel3: f.hintLevel3,
    progress: f.progress,
    progressEmpty: f.progressEmpty,
    attemptsPage: f.attemptsPage,
  };

  it.each(Object.entries(PUBLIC_FIXTURES))('%s holds no hidden field', (_name, fixture) => {
    const text = JSON.stringify(fixture);
    for (const field of HIDDEN) expect(text).not.toContain(field);
  });

  it('the attempt response is where hidden tests and the solution appear', () => {
    expect(f.attemptCreated.referenceSolution).toEqual(expect.any(String));
    expect(f.attemptCreated.tests.filter((t) => !t.visible).map((t) => t.id)).toEqual(['t3', 't4']);
  });
});

describe('mockRequest', () => {
  beforeEach(() => {
    resetMocks();
    vi.unstubAllEnvs();
  });

  const userId = f.userCreated.id;

  it('serves GET examples', async () => {
    await expect(mockRequest({ path: '/api/health' })).resolves.toEqual({
      status: 200,
      data: f.health,
    });
    await expect(mockRequest({ path: '/api/challenges/find-max' })).resolves.toEqual({
      status: 200,
      data: f.findMaxPublic,
    });
  });

  it('returns copies, not the fixtures themselves', async () => {
    const { data } = await mockRequest({ path: '/api/challenges' });
    data[0].title = 'changed';
    expect(f.challengeList[0].title).toBe('Largest number in a list');
  });

  it('unknown challenge is 404', async () => {
    const res = await mockRequest({ path: '/api/challenges/nope' });
    expect(res).toEqual({ status: 404, data: f.errorChallengeNotFound });
    const hint = await mockRequest({
      method: 'POST',
      path: '/api/challenges/nope/hints',
      body: { level: 1 },
    });
    expect(hint.status).toBe(404);
  });

  it.each([['Find-Max'], ['a b'], ['x'.repeat(65)]])(
    'challenge id %j not matching [a-z0-9-]{1,64} is 400',
    async (id) => {
      const path = `/api/challenges/${encodeURIComponent(id)}`;
      expect((await mockRequest({ path })).status).toBe(400);
      const hint = await mockRequest({ method: 'POST', path: `${path}/hints`, body: { level: 1 } });
      expect(hint.status).toBe(400);
      const attempt = await mockRequest({
        method: 'POST',
        path: '/api/attempts',
        body: { ...f.attemptRequest, challengeId: id },
      });
      expect(attempt.status).toBe(400);
      expect(attempt.data.error.code).toBe('VALIDATION_ERROR');
    },
  );

  it('without crypto.randomUUID, attempt ids stay unique UUIDs', async () => {
    vi.stubGlobal('crypto', {});
    try {
      const a = await mockRequest({
        method: 'POST',
        path: '/api/attempts',
        body: f.attemptRequest,
      });
      const b = await mockRequest({
        method: 'POST',
        path: '/api/attempts',
        body: f.attemptRequest,
      });
      expect(a.data.attemptId).not.toBe(b.data.attemptId);
      expect(a.data.attemptId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('unknown route is 404', async () => {
    const res = await mockRequest({ path: '/api/nothing' });
    expect(res.status).toBe(404);
    expect(res.data.error.code).toBe('NOT_FOUND');
  });

  it.each([[1], [2], [3]])('hint level %i', async (level) => {
    const res = await mockRequest({
      method: 'POST',
      path: '/api/challenges/find-max/hints',
      body: { level },
    });
    expect(res.status).toBe(200);
    expect(res.data.level).toBe(level);
    expect(res.data.source).toBe('written');
  });

  it.each([['1'], [1.5], [4], [0], [undefined]])('hint level %j is 400', async (level) => {
    const res = await mockRequest({
      method: 'POST',
      path: '/api/challenges/find-max/hints',
      body: { level },
    });
    expect(res.status).toBe(400);
    expect(res.data.error.code).toBe('VALIDATION_ERROR');
  });

  it('attempt with a short trimmed explanation is 400 with the doc message', async () => {
    const res = await mockRequest({
      method: 'POST',
      path: '/api/attempts',
      // 26 characters, but only 17 after trimming.
      body: { ...f.attemptRequest, explanation: '     short explanation    ' },
    });
    expect(res).toEqual({ status: 400, data: f.errorValidation });
  });

  it('attempt is 201 with all tests and the solution', async () => {
    const res = await mockRequest({
      method: 'POST',
      path: '/api/attempts',
      body: f.attemptRequest,
    });
    expect(res.status).toBe(201);
    expect(res.data.tests).toEqual(f.attemptCreated.tests);
    expect(res.data.referenceSolution).toBe(f.attemptCreated.referenceSolution);
    expect(res.data.attemptId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('second evaluation of the same attempt is 409', async () => {
    const path = `/api/attempts/${f.attemptCreated.attemptId}/evaluation`;
    const first = await mockRequest({ method: 'POST', path, body: f.evaluationRequest });
    expect(first).toEqual({ status: 200, data: f.evaluationAi });
    const second = await mockRequest({ method: 'POST', path, body: f.evaluationRequest });
    expect(second).toEqual({ status: 409, data: f.errorAlreadyEvaluated });
  });

  it('VITE_MOCK_EVALUATION=fallback returns the fallback evaluation', async () => {
    vi.stubEnv('VITE_MOCK_EVALUATION', 'fallback');
    const path = `/api/attempts/${f.attemptCreated.attemptId}/evaluation`;
    const res = await mockRequest({ method: 'POST', path, body: f.evaluationRequest });
    expect(res).toEqual({ status: 200, data: f.evaluationFallback });
  });

  it('attempts paging: cursorId alone is 400, cursor gives [], none gives the page', async () => {
    const base = `/api/attempts?userId=${userId}`;
    expect((await mockRequest({ path: `${base}&cursorId=${userId}` })).status).toBe(400);
    expect(
      await mockRequest({
        path: `${base}&cursor=2026-11-03T10%3A15%3A30.123456%2B00%3A00&cursorId=${userId}`,
      }),
    ).toEqual({ status: 200, data: [] });
    expect(await mockRequest({ path: base })).toEqual({ status: 200, data: f.attemptsPage });
  });

  it('progress without userId is 400', async () => {
    expect((await mockRequest({ path: '/api/progress' })).status).toBe(400);
    expect(await mockRequest({ path: `/api/progress?userId=${userId}` })).toEqual({
      status: 200,
      data: f.progress,
    });
  });

  it('createUser is 201 with the trimmed name', async () => {
    const res = await mockRequest({
      method: 'POST',
      path: '/api/users',
      body: { displayName: ' dion ' },
    });
    expect(res.status).toBe(201);
    expect(res.data.displayName).toBe('dion');
  });

  it('the delay is abortable', async () => {
    const controller = new AbortController();
    const pending = mockRequest({ path: '/api/health', signal: controller.signal });
    controller.abort();
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('account mocks', () => {
  beforeEach(() => resetMocks());

  const post = (path, body, headers) => mockRequest({ method: 'POST', path, body, headers });
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });

  it('fixtures follow the auth contract and never carry an email or password back', () => {
    expect(Object.keys(f.authResponse).sort()).toEqual(['session', 'user']);
    expect(Object.keys(f.authSession).sort()).toEqual(['accessToken', 'expiresAt', 'refreshToken']);
    expect(Object.keys(f.accountUser).sort()).toEqual([
      'displayName',
      'handle',
      'id',
      'memberSince',
    ]);
    expect(Object.keys(f.refreshResponse)).toEqual(['session']);
    expect(Object.keys(f.profile.rank).sort()).toEqual(['name', 'nextName', 'xp', 'xpToNext']);
    for (const fixture of [f.authResponse, f.refreshResponse, f.me, f.profile, f.profileEmpty]) {
      expect(JSON.stringify(fixture)).not.toMatch(/email|password/i);
    }
  });

  it('signup creates an account, logs it in and serves its profile', async () => {
    const res = await post('/api/auth/signup', {
      handle: 'New_Hunter',
      email: 'new@example.com',
      password: 'long-enough-pw',
    });
    expect(res.status).toBe(201);
    expect(res.data.user).toMatchObject({ handle: 'new_hunter', displayName: 'new_hunter' });
    expect(res.data.session.expiresAt).toBeGreaterThan(Date.now() / 1000);

    const me = await mockRequest({
      path: '/api/me',
      headers: bearer(res.data.session.accessToken),
    });
    expect(me).toEqual({ status: 200, data: res.data.user });

    const profile = await mockRequest({ path: '/api/profiles/new_hunter' });
    expect(profile.status).toBe(200);
    expect(profile.data).toMatchObject({ handle: 'new_hunter', solved: 0, totalXp: 0 });
  });

  it.each([
    ['handle too short', { ...f.signupRequest, handle: 'ab' }],
    ['reserved handle', { ...f.signupRequest, handle: 'admin' }],
    ['bad email', { ...f.signupRequest, email: 'nope' }],
    ['short password', { ...f.signupRequest, password: 'short' }],
  ])('signup rejects %s with 400', async (_name, body) => {
    expect((await post('/api/auth/signup', body)).status).toBe(400);
  });

  it('signup returns 409 HANDLE_TAKEN and EMAIL_TAKEN', async () => {
    const handle = await post('/api/auth/signup', { ...f.signupRequest, email: 'x@example.com' });
    expect(handle).toEqual({ status: 409, data: f.errorHandleTaken });
    const email = await post('/api/auth/signup', { ...f.signupRequest, handle: 'other_one' });
    expect(email).toEqual({ status: 409, data: f.errorEmailTaken });
  });

  it('login succeeds with the fixture account and fails generically otherwise', async () => {
    const ok = await post('/api/auth/login', f.loginRequest);
    expect(ok.status).toBe(200);
    expect(ok.data.user).toEqual(f.accountUser);
    const wrong = await post('/api/auth/login', { ...f.loginRequest, password: 'wrong-password' });
    expect(wrong).toEqual({ status: 401, data: f.errorInvalidCredentials });
    const unknown = await post('/api/auth/login', { ...f.loginRequest, email: 'who@example.com' });
    expect(unknown).toEqual({ status: 401, data: f.errorInvalidCredentials });
  });

  it('refresh returns a new session; a revoked token is 401', async () => {
    const ok = await post('/api/auth/refresh', f.refreshRequest);
    expect(ok.status).toBe(200);
    expect(Object.keys(ok.data)).toEqual(['session']);
    expect((await post('/api/auth/refresh', { refreshToken: 'revoked' })).status).toBe(401);
    expect((await post('/api/auth/refresh', {})).status).toBe(400);
  });

  it('logout and /api/me need a known bearer token', async () => {
    expect(await post('/api/auth/logout', undefined, bearer(f.authSession.accessToken))).toEqual({
      status: 204,
      data: null,
    });
    expect((await post('/api/auth/logout')).status).toBe(401);
    expect((await mockRequest({ path: '/api/me' })).status).toBe(401);
    expect((await mockRequest({ path: '/api/me', headers: bearer('nope') })).status).toBe(401);
  });

  it('profiles: fixture, 404 for unknown handles, 400 for invalid ones', async () => {
    expect(await mockRequest({ path: '/api/profiles/null_pointer' })).toEqual({
      status: 200,
      data: f.profile,
    });
    expect(await mockRequest({ path: '/api/profiles/nobody_here' })).toEqual({
      status: 404,
      data: f.errorProfileNotFound,
    });
    expect((await mockRequest({ path: '/api/profiles/Bad%20Handle' })).status).toBe(400);
  });
});
