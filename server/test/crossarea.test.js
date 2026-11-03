import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import { readFileSync } from 'node:fs';
import { createFakeSupabase } from './fakeSupabase.js';
import { collectKeys, expectNoLeak, loadFindMaxRow } from './fixtures.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('../src/db/client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const { app } = await import('../src/app.js');
const { config } = await import('../src/lib/config.js');
const { aiLimiter, apiLimiter } =
  await import('../src/middleware/rateLimit.js');
const { calculateScore } = await import('../src/services/scoringService.js');
const { EvaluationResultSchema } = await import('../src/schemas/aiOutput.js');

const row = loadFindMaxRow();
const original = { ...config };
const demoFile = JSON.parse(
  readFileSync(new URL('../data/demo-responses.json', import.meta.url), 'utf8'),
);

const FEEDBACK_FIELDS = [
  'detected_misconception',
  'explanation_quality',
  'feedback',
  'hint',
  'is_correct',
  'needs_clarification',
  'practice_tip',
];

const aiEval = {
  is_correct: true,
  explanation_quality: 8,
  detected_misconception: 'Pretpostavka o pozitivnim brojevima.',
  needs_clarification: false,
  hint: null,
  feedback: 'Dobro objašnjenje početne vrijednosti.',
  practice_tip: 'Kreni od prvog elementa liste.',
};

let fetchMock;
const llmReply = (content) => ({
  ok: true,
  status: 200,
  json: async () => ({ choices: [{ message: { content } }] }),
});

function setMode(mode) {
  Object.assign(config, original);
  if (mode === 'ai') {
    Object.assign(config, {
      aiStatus: 'available',
      demoMode: false,
      llmApiKey: 'secret-test-key',
      llmApiUrl: 'https://llm.example.test/v1',
      llmModel: 'm',
    });
  } else if (mode === 'demo') {
    Object.assign(config, { aiStatus: 'demo', demoMode: true });
  } else {
    Object.assign(config, {
      aiStatus: 'unavailable',
      demoMode: false,
      llmApiKey: '',
    });
  }
}

beforeEach(() => {
  state.db = createFakeSupabase({
    tables: { challenges: [row], users: [], attempts: [] },
  }).db;
  fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  for (const key of ['::ffff:127.0.0.1', '127.0.0.1', '::/56']) {
    aiLimiter.resetKey(key);
    apiLimiter.resetKey(key);
  }
});
afterEach(() => {
  Object.assign(config, original);
  vi.unstubAllGlobals();
});

const FIXED =
  'def find_max(numbers):\n    return max(numbers) if numbers else None';
const attemptBody = (extra = {}) => ({
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation:
    'Početna vrijednost max_value je 0, pa negativne liste vraćaju 0, a prazna lista ne vraća None.',
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode: FIXED,
  hintsUsed: 1,
  durationSec: 40,
  ...extra,
});
const evalBody = {
  testResults: [
    { id: 't1', passed: true },
    { id: 't2', passed: true },
    { id: 't3', passed: true },
    { id: 't4', passed: true },
  ],
  edgeCaseCheck: { originalOutput: 0, referenceOutput: -3 },
};

async function fullFlow(extra = {}) {
  const user = await request(app)
    .post('/api/users')
    .send({ displayName: 'dion' });
  const created = await request(app)
    .post('/api/attempts')
    .send(attemptBody({ userId: user.body.id, ...extra }));
  expect(created.status).toBe(201);
  const evaluation = await request(app)
    .post(`/api/attempts/${created.body.attemptId}/evaluation`)
    .send(evalBody);
  const progress = await request(app).get(
    `/api/progress?userId=${user.body.id}`,
  );
  return { user, created, evaluation, progress };
}

describe('full flow without the LLM (hard rule 6)', () => {
  it('AI unavailable: completes with feedbackSource "fallback", never calls fetch', async () => {
    setMode('none');
    const { evaluation, progress } = await fullFlow();
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.feedbackSource).toBe('fallback');
    expect(fetchMock).not.toHaveBeenCalled();
    const q = evaluation.body.feedback.explanation_quality;
    const expected = calculateScore({
      attempt: {
        selectedLines: [2],
        edgeCase: { expected: -3 },
        fixedCode: FIXED,
        hintsUsed: 1,
      },
      challenge: row,
      explanationQuality: q,
      edgeCaseCheck: evalBody.edgeCaseCheck,
      testResults: evalBody.testResults,
    });
    expect(evaluation.body.score).toBe(expected.total);
    expect(evaluation.body.breakdown).toEqual(expected.breakdown);
    expect(evaluation.body.breakdown.explanation).toBe(Math.round(q * 3));
    expect(evaluation.body.testsPassed).toBe(4);
    expect(evaluation.body.testsTotal).toBe(4);
    expect(progress.status).toBe(200);
    expect(progress.body.attempted).toBe(1);
    expect(progress.body.perChallenge[0]).toMatchObject({
      challengeId: 'find-max',
      bestScore: evaluation.body.score,
      attempts: 1,
    });
  });

  it('DEMO_MODE: feedbackSource "demo" and the worked example scores exactly 89', async () => {
    setMode('demo');
    const { evaluation, progress } = await fullFlow();
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.feedbackSource).toBe('demo');
    expect(evaluation.body.breakdown).toEqual({
      lineIdentification: 40,
      explanation: 24,
      edgeCase: 20,
      fix: 10,
      hintPenalty: -5,
    });
    expect(evaluation.body.score).toBe(89);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(progress.body.totalScore).toBe(89);
    expect(progress.body.perChallenge[0].bestScore).toBe(89);
  });

  it('AI configured but the provider is down: falls back, flow completes', async () => {
    setMode('ai');
    fetchMock.mockRejectedValue(new TypeError('fetch failed'));
    const { evaluation } = await fullFlow();
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.feedbackSource).toBe('fallback');
  });
});

describe('cross-area: C evaluateExplanation result vs B EvaluationResultSchema', () => {
  it('a valid AI result passes end to end as feedbackSource "ai" (not silently replaced)', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(llmReply(JSON.stringify(aiEval)));
    const { evaluation } = await fullFlow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(evaluation.body.feedbackSource).toBe('ai');
    expect(evaluation.body.feedback.feedback).toBe(aiEval.feedback);
    expect(evaluation.body.feedback.practice_tip).toBe(aiEval.practice_tip);
    expect(evaluation.body.breakdown.explanation).toBe(24);
    expect(evaluation.body.score).toBe(89);
  });

  it('C maximum-size output (quality 10, 1200/300/300/400 chars) is accepted by B', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(
      llmReply(
        JSON.stringify({
          explanation_quality: 10,
          detected_misconception: 'm'.repeat(300),
          needs_clarification: false,
          hint: 'h'.repeat(300),
          feedback: 'f'.repeat(1200),
          practice_tip: 't'.repeat(400),
        }),
      ),
    );
    const { evaluation } = await fullFlow();
    expect(evaluation.body.feedbackSource).toBe('ai');
    expect(evaluation.body.feedback.feedback).toHaveLength(1200);
    expect(evaluation.body.breakdown.explanation).toBe(30);
  });

  it('C clamps an out-of-range quality and B still sees source "ai"', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(
      llmReply(JSON.stringify({ ...aiEval, explanation_quality: 14.4 })),
    );
    const { evaluation } = await fullFlow();
    expect(evaluation.body.feedbackSource).toBe('ai');
    expect(evaluation.body.feedback.explanation_quality).toBe(10);
  });

  it('invalid JSON from the LLM falls back (not "ai")', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(llmReply('not json at all'));
    const { evaluation } = await fullFlow();
    expect(evaluation.status).toBe(200);
    expect(evaluation.body.feedbackSource).toBe('fallback');
  });

  it('every entry of data/demo-responses.json passes B schema', async () => {
    const { DemoResponsesSchema } = await import('../src/schemas/aiOutput.js');
    const parsed = DemoResponsesSchema.parse(demoFile);
    for (const [id, entry] of Object.entries(parsed)) {
      expect(
        EvaluationResultSchema.safeParse({
          source: 'demo',
          ...entry.evaluation,
        }).success,
        `demo entry ${id}`,
      ).toBe(true);
      expect(
        EvaluationResultSchema.safeParse({
          source: 'demo',
          ...demoFile[id].evaluation,
        }).success,
        `raw demo entry ${id}`,
      ).toBe(true);
    }
  });

  it('C output limits are never looser than B limits', async () => {
    const { EvaluationOutputSchema } =
      await import('../src/schemas/aiOutput.js');
    const base = {
      explanation_quality: 5,
      detected_misconception: null,
      needs_clarification: false,
      hint: null,
      feedback: 'ok',
      practice_tip: null,
    };
    const rejects = (patch) =>
      EvaluationOutputSchema.safeParse({ ...base, ...patch }).success;
    expect(rejects({ feedback: 'x'.repeat(1201) })).toBe(false);
    expect(rejects({ hint: 'x'.repeat(301) })).toBe(false);
    expect(rejects({ detected_misconception: 'x'.repeat(301) })).toBe(false);
    expect(rejects({ practice_tip: 'x'.repeat(401) })).toBe(false);
  });
});

describe('parity: ai, fallback, demo through POST /evaluation', () => {
  for (const [mode, source] of [
    ['ai', 'ai'],
    ['none', 'fallback'],
    ['demo', 'demo'],
  ]) {
    it(`${source}: documented response with all eight fields (source as feedbackSource)`, async () => {
      setMode(mode);
      if (mode === 'ai')
        fetchMock.mockResolvedValue(llmReply(JSON.stringify(aiEval)));
      const { evaluation: res } = await fullFlow();
      expect(res.status).toBe(200);
      expect(res.body.feedbackSource).toBe(source);
      expect(Object.keys(res.body.feedback).sort()).toEqual(FEEDBACK_FIELDS);
      expect(
        EvaluationResultSchema.safeParse({
          source: res.body.feedbackSource,
          ...res.body.feedback,
        }).success,
      ).toBe(true);
      const f = res.body.feedback;
      expect(typeof f.is_correct).toBe('boolean');
      expect(typeof f.needs_clarification).toBe('boolean');
      expect(typeof f.feedback).toBe('string');
      expect(f.explanation_quality).toBeGreaterThanOrEqual(0);
      expect(f.explanation_quality).toBeLessThanOrEqual(10);
      expect(f.is_correct).toBe(f.explanation_quality >= 7);
      for (const k of ['detected_misconception', 'hint', 'practice_tip']) {
        expect(f[k] === null || typeof f[k] === 'string').toBe(true);
      }
      expect(Object.keys(res.body).sort()).toEqual([
        'breakdown',
        'feedback',
        'feedbackSource',
        'score',
        'testsPassed',
        'testsTotal',
      ]);
    });
  }
});

describe('leak: hints in AI, demo and written modes', () => {
  const hint = (level, body = {}) =>
    request(app)
      .post('/api/challenges/find-max/hints')
      .send({ level, ...body });

  for (const mode of ['ai', 'demo', 'none']) {
    it(`${mode}: public routes leak nothing and hints are exactly {level, hint, source}`, async () => {
      setMode(mode);
      if (mode === 'ai') {
        fetchMock.mockResolvedValue(
          llmReply('{"hint":"Šta ako su svi brojevi negativni?"}'),
        );
      }
      expectNoLeak(expect, await request(app).get('/api/challenges'), row);
      const detail = await request(app).get('/api/challenges/find-max');
      expect(detail.text).not.toContain(row.reference_solution);
      expect(detail.text).not.toContain(row.bug_description);
      for (const level of [1, 2, 3]) {
        const res = await hint(level);
        expect(res.status).toBe(200);
        expect(Object.keys(res.body).sort()).toEqual([
          'hint',
          'level',
          'source',
        ]);
        expect(res.body.level).toBe(level);
        expect(res.body.source).toBe(
          { none: 'written', demo: 'demo', ai: 'ai' }[mode],
        );
        // the hint text itself is legitimately returned, so hints_json is excluded
        expectNoLeak(expect, res, { ...row, hints_json: [] });
        expect(collectKeys(res.body).has('bug_description')).toBe(false);
        expect(res.text).not.toContain(row.reference_solution);
      }
    });
  }

  it('the hint prompt sent to the LLM has no bug_description, reference solution or keywords', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(llmReply('{"hint":"Pogledaj početak."}'));
    const res = await hint(2, {
      currentAnswer: { selectedLines: [2], explanation: 'moje objašnjenje' },
    });
    expect(res.body.source).toBe('ai');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = fetchMock.mock.calls[0][1].body;
    expect(sent).toContain('moje objašnjenje');
    expect(sent).not.toContain('bug_description');
    expect(sent).not.toContain('reference_solution');
    expect(sent).not.toContain('expected_bug');
    expect(sent).not.toContain(
      JSON.stringify(row.bug_description).slice(1, -1),
    );
    expect(sent).not.toContain(
      JSON.stringify(row.reference_solution).slice(1, -1),
    );
    expect(sent).not.toContain('numbers[0]');
    expect(sent).not.toContain(row.fallback_feedback);
    expect(sent).not.toContain('secret-test-key');
    expect(res.text).not.toContain('secret-test-key');
  });

  it('the evaluation prompt carries no secret, no user id and no reference solution', async () => {
    setMode('ai');
    fetchMock.mockResolvedValue(llmReply(JSON.stringify(aiEval)));
    const { user } = await fullFlow();
    const sent = fetchMock.mock.calls[0][1].body;
    expect(sent).toContain('<student_answer>');
    expect(sent).not.toContain(user.body.id);
    expect(sent).not.toContain('secret-test-key');
    expect(sent).not.toContain(
      JSON.stringify(row.reference_solution).slice(1, -1),
    );
  });

  it('POST /api/attempts response is exactly { attemptId, tests, referenceSolution }', async () => {
    setMode('none');
    const res = await request(app).post('/api/attempts').send(attemptBody());
    expect(res.status).toBe(201);
    expect(Object.keys(res.body).sort()).toEqual([
      'attemptId',
      'referenceSolution',
      'tests',
    ]);
  });
});

describe('remaining error codes', () => {
  it('evaluation 400 on a bad id; attempts 413 oversize and 404 unknown user', async () => {
    setMode('none');
    const bad = await request(app)
      .post('/api/attempts/not-a-uuid/evaluation')
      .send(evalBody);
    expect(bad.status).toBe(400);
    expect(bad.body.error.code).toBe('VALIDATION_ERROR');
    const big = await request(app)
      .post('/api/attempts')
      .send(attemptBody({ explanation: 'x'.repeat(60000) }));
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('PAYLOAD_TOO_LARGE');
    const unknownUser = await request(app)
      .post('/api/attempts')
      .send(attemptBody({ userId: '33333333-3333-4333-8333-333333333333' }));
    expect(unknownUser.status).toBe(404);
  });

  it('error responses contain no stack trace and no secret', async () => {
    setMode('ai');
    const res = await request(app).get('/api/challenges/nope');
    expect(res.text).not.toContain('secret-test-key');
    expect(res.text).not.toMatch(/\bat .*\.js:\d+/);
  });
});
