import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('../db/client.js', () => ({ db: { from: () => ({}) } }));

const { evaluateWithFallback, computeProgress } =
  await import('./attemptService.js');
const { evaluateWithKeywords } = await import('./fallbackService.js');
const { EvaluationResultSchema } = await import('../schemas/aiOutput.js');
const { config } = await import('../lib/config.js');
const { logger } = await import('../lib/logger.js');

const challenge = {
  keywords_json: [['initiali'], ['negative'], ['empty']],
  fallback_feedback: 'Look at the starting value.',
};
const context = {
  challenge,
  answer: { explanation: 'wrong initialization and negative numbers' },
};
const good = {
  source: 'ai',
  is_correct: true,
  explanation_quality: 8,
  detected_misconception: null,
  needs_clarification: false,
  hint: null,
  feedback: 'Good.',
  practice_tip: null,
};

describe('fallback after a failed evaluation (fallbackService.evaluateWithKeywords)', () => {
  const failing = () => Promise.reject(new Error('down'));
  const fallbackOf = (ctx) => evaluateWithFallback(ctx, { evaluate: failing });

  it.each([
    ['0 groups', 'nothing', 0],
    ['1 group', 'initialization', 3],
    ['2 groups', 'initialization negative', 7],
    ['3 groups', 'initialization negative empty', 10],
  ])('%s: deep-equals the keyword evaluation', async (_n, explanation, q) => {
    const ctx = { challenge, answer: { explanation } };
    const out = await fallbackOf(ctx);
    expect(out).toEqual({ source: 'fallback', ...evaluateWithKeywords(ctx) });
    expect(out.explanation_quality).toBe(q);
    expect(out.is_correct).toBe(q >= 7);
    expect(out.feedback).toBe(challenge.fallback_feedback);
  });

  it('blank fallback_feedback and an undefined explanation give the generic feedback', async () => {
    const ctx = { challenge: { fallback_feedback: ' ' }, answer: {} };
    const out = await fallbackOf(ctx);
    expect(out).toEqual({ source: 'fallback', ...evaluateWithKeywords(ctx) });
    expect(out.explanation_quality).toBe(0);
    expect(out.feedback).toMatch(/Assessed without AI/);
  });

  it('tolerates a context without answer or challenge', async () => {
    const out = await fallbackOf({});
    expect(out).toEqual({ source: 'fallback', ...evaluateWithKeywords({}) });
  });

  it('the fallback result passes EvaluationResultSchema', async () => {
    const out = await fallbackOf(context);
    expect(EvaluationResultSchema.safeParse(out).success).toBe(true);
  });
});

describe('evaluateWithFallback', () => {
  it('passes a valid result through', async () => {
    expect(
      await evaluateWithFallback(context, { evaluate: async () => good }),
    ).toEqual(good);
  });

  it('falls back when evaluate throws synchronously', async () => {
    const out = await evaluateWithFallback(context, {
      evaluate: () => {
        throw new Error('boom');
      },
    });
    expect(out.source).toBe('fallback');
    expect(out.explanation_quality).toBe(7);
  });

  it('falls back when evaluate rejects', async () => {
    const out = await evaluateWithFallback(context, {
      evaluate: () => Promise.reject(new Error('down')),
    });
    expect(out.source).toBe('fallback');
  });

  it('falls back when evaluate hangs past the timeout', async () => {
    const out = await evaluateWithFallback(context, {
      timeoutMs: 20,
      evaluate: () => new Promise(() => {}),
    });
    expect(out.source).toBe('fallback');
  });

  it('the default outer guard fires at AI_TIMEOUT_MS + 1000 ms', async () => {
    vi.useFakeTimers();
    try {
      let settled = false;
      const pending = evaluateWithFallback(context, {
        evaluate: () => new Promise(() => {}),
      }).then((out) => {
        settled = true;
        return out;
      });
      await vi.advanceTimersByTimeAsync(config.aiTimeoutMs + 999);
      expect(settled).toBe(false);
      await vi.advanceTimersByTimeAsync(1);
      const out = await pending;
      expect(out.source).toBe('fallback');
    } finally {
      vi.useRealTimers();
    }
  });

  it('falls back on out-of-range quality and oversized strings', async () => {
    for (const bad of [
      { ...good, explanation_quality: 11 },
      { ...good, explanation_quality: -1 },
      { ...good, feedback: 'x'.repeat(2001) },
      { ...good, hint: 'x'.repeat(301) },
      { ...good, detected_misconception: 'x'.repeat(301) },
      { ...good, practice_tip: 'x'.repeat(401) },
    ]) {
      const out = await evaluateWithFallback(context, {
        evaluate: async () => bad,
      });
      expect(out.source).toBe('fallback');
    }
  });

  it('falls back on an invalid result shape', async () => {
    for (const bad of [
      null,
      {},
      { ...good, explanation_quality: 'high' },
      { ...good, source: 'x' },
    ]) {
      const out = await evaluateWithFallback(context, {
        evaluate: async () => bad,
      });
      expect(out.source).toBe('fallback');
    }
  });
});

describe('evaluateWithFallback logging', () => {
  const SECRET_TEXT = 'tajni-tekst-studenta-xyz';
  const ctx = {
    attemptId: 'att-1',
    challenge,
    answer: { explanation: SECRET_TEXT, fixedCode: SECRET_TEXT },
  };
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function warnFor(options) {
    const warn = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const out = await evaluateWithFallback(ctx, options);
    expect(out.source).toBe('fallback');
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(warn.mock.calls)).not.toContain(SECRET_TEXT);
    return warn.mock.calls[0][0];
  }

  it('evaluate_threw when evaluate throws or rejects', async () => {
    for (const evaluate of [
      () => {
        throw new Error(SECRET_TEXT);
      },
      () => Promise.reject(new Error(SECRET_TEXT)),
    ]) {
      vi.restoreAllMocks();
      expect(await warnFor({ evaluate })).toEqual({
        route: 'evaluation',
        attemptId: 'att-1',
        reason: 'evaluate_threw',
      });
    }
  });

  it('timeout when the outer guard fires', async () => {
    expect(
      await warnFor({ timeoutMs: 10, evaluate: () => new Promise(() => {}) }),
    ).toEqual({ route: 'evaluation', attemptId: 'att-1', reason: 'timeout' });
  });

  it('invalid_result with issue paths only, never values', async () => {
    const fields = await warnFor({
      evaluate: async () => ({
        ...good,
        feedback: SECRET_TEXT.repeat(200),
        hint: 7,
      }),
    });
    expect(fields).toEqual({
      route: 'evaluation',
      attemptId: 'att-1',
      reason: 'invalid_result',
      paths: expect.arrayContaining(['feedback', 'hint']),
    });
    expect(fields.paths).toHaveLength(2);
  });
});

describe('computeProgress', () => {
  const cats = new Map([['a', 'A']]);

  it('is empty for no rows', () => {
    expect(computeProgress([], cats)).toEqual({
      totalScore: 0,
      totalXp: 0,
      solved: 0,
      attempted: 0,
      averageDurationSec: 0,
      perChallenge: [],
      weakCategories: [],
    });
  });

  it('counts a submitted-only challenge as attempted with best 0', () => {
    const out = computeProgress(
      [{ challenge_id: 'a', status: 'submitted', score: null }],
      cats,
    );
    expect(out.attempted).toBe(1);
    expect(out.solved).toBe(0);
    expect(out.perChallenge).toEqual([
      { challengeId: 'a', bestScore: 0, attempts: 1, xp: 0 },
    ]);
  });

  it('solved needs a best score of at least 70 and keeps top 3 weak categories', () => {
    const rows = [];
    const many = new Map();
    for (const [i, id] of ['a', 'b', 'c', 'd'].entries()) {
      many.set(id, `C${id}`);
      for (let n = 0; n <= i; n += 1) {
        rows.push({
          challenge_id: id,
          status: 'evaluated',
          score: 69,
          score_breakdown: { lineIdentification: 40 },
          duration: 10,
        });
      }
    }
    rows.push({
      challenge_id: 'a',
      status: 'evaluated',
      score: 70,
      score_breakdown: {},
      duration: 30,
    });
    const out = computeProgress(rows, many);
    expect(out.solved).toBe(1);
    expect(out.averageDurationSec).toBe(30);
    expect(out.weakCategories).toHaveLength(3);
    expect(out.weakCategories[0]).toEqual({ category: 'Cd', misses: 4 });
  });

  it('on a score tie the newest attempt is best and its duration is used', () => {
    // listAttemptSummaries returns rows newest first.
    const rows = [
      {
        challenge_id: 'a',
        status: 'evaluated',
        score: 80,
        score_breakdown: { lineIdentification: 40 },
        duration: 50,
      },
      {
        challenge_id: 'a',
        status: 'evaluated',
        score: 80,
        score_breakdown: { lineIdentification: 40 },
        duration: 300,
      },
    ];
    const out = computeProgress(rows, cats);
    expect(out.solved).toBe(1);
    expect(out.totalScore).toBe(80);
    expect(out.averageDurationSec).toBe(50);
  });
});
