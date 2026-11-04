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

/** Inline `{ ... }` JSON examples in the doc text that contain the given marker. */
function inlineExample(marker) {
  const match = [...apiDoc.matchAll(/`(\{[^`]*\})`/g)].find((m) => m[1].includes(marker));
  return match ? JSON.parse(match[1]) : undefined;
}

describe('fixtures match docs/API.md', () => {
  it('has one fixture per JSON block', () => {
    expect(docBlocks).toHaveLength(BLOCK_FIXTURES.length);
  });

  it.each(BLOCK_FIXTURES.map(([name, fixture], i) => [name, fixture, i]))(
    '%s',
    (_name, fixture, index) => {
      expect(fixture).toEqual(docBlocks[index]);
    },
  );

  it('error envelope example', () => {
    expect(f.errorValidation).toEqual(inlineExample('"VALIDATION_ERROR"'));
  });

  it('empty progress example', () => {
    expect(f.progressEmpty).toEqual(inlineExample('"totalScore": 0'));
  });

  it('user request and response examples', () => {
    expect(f.userRequest).toEqual(inlineExample('{ "displayName"'));
    const created = inlineExample('"id": "uuid"');
    expect(Object.keys(f.userCreated).sort()).toEqual(Object.keys(created).sort());
    expect(f.userCreated.displayName).toBe(created.displayName);
  });

  it('fallback evaluation follows docs/SCORING.md', () => {
    const { feedback, breakdown } = f.evaluationFallback;
    expect(f.evaluationFallback.feedbackSource).toBe('fallback');
    expect([0, 3, 7, 10]).toContain(feedback.explanation_quality);
    expect(breakdown.explanation).toBe(Math.round(feedback.explanation_quality * 3));
    const sum = Object.values(breakdown).reduce((a, b) => a + b, 0);
    expect(f.evaluationFallback.score).toBe(sum);
    expect(feedback).toEqual({
      is_correct: feedback.explanation_quality >= 7,
      explanation_quality: 7,
      detected_misconception: null,
      needs_clarification: false,
      hint: null,
      feedback: expect.any(String),
      practice_tip: null,
    });
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
    expect(f.challengeList[0].title).toBe('Najveći element liste');
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
      // 26 characters, but only 18 after trimming.
      body: { ...f.attemptRequest, explanation: '     kratko objašnjenje   ' },
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
