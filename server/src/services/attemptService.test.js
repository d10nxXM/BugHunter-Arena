import { describe, it, expect, vi } from 'vitest';

vi.mock('../db/client.js', () => ({ db: { from: () => ({}) } }));

const { evaluateWithFallback, localFallbackEvaluation, computeProgress } =
  await import('./attemptService.js');

const challenge = {
  keywords_json: [['inicijaliz'], ['negativ'], ['prazn']],
  fallback_feedback: 'Pogledaj početnu vrijednost.',
};
const context = {
  challenge,
  answer: { explanation: 'početna inicijalizacija i negativni brojevi' },
};
const good = {
  source: 'ai',
  is_correct: true,
  explanation_quality: 8,
  detected_misconception: null,
  needs_clarification: false,
  hint: null,
  feedback: 'Dobro.',
  practice_tip: null,
};

describe('localFallbackEvaluation', () => {
  it('maps matched groups to 0, 3, 7, 10', () => {
    const q = (text) =>
      localFallbackEvaluation(challenge, text).explanation_quality;
    expect(q('ništa')).toBe(0);
    expect(q('inicijalizacija')).toBe(3);
    expect(q('inicijalizacija negativ')).toBe(7);
    expect(q('inicijalizacija negativ prazna')).toBe(10);
  });

  it('uses generic feedback when fallback_feedback is blank, tolerates bad input', () => {
    const out = localFallbackEvaluation({ fallback_feedback: ' ' }, undefined);
    expect(out.explanation_quality).toBe(0);
    expect(out.feedback).toMatch(/Procjena bez AI-ja/);
    expect(out.source).toBe('fallback');
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

  it('falls back on out-of-range quality and oversized strings', async () => {
    for (const bad of [
      { ...good, explanation_quality: 11 },
      { ...good, explanation_quality: -1 },
      { ...good, feedback: 'x'.repeat(2001) },
      { ...good, hint: 'x'.repeat(501) },
      { ...good, practice_tip: 'x'.repeat(501) },
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

describe('computeProgress', () => {
  const cats = new Map([['a', 'A']]);

  it('is empty for no rows', () => {
    expect(computeProgress([], cats)).toEqual({
      totalScore: 0,
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
      { challengeId: 'a', bestScore: 0, attempts: 1 },
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
});
