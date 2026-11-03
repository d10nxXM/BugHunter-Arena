import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFindMaxRow } from '../../test/fixtures.js';

const mocks = vi.hoisted(() => ({
  evaluateAnswer: vi.fn(),
  complete: vi.fn(),
  config: {
    aiStatus: 'available',
    demoMode: false,
    aiTimeoutMs: 15000,
    logLevel: 'silent',
  },
}));
vi.mock('../lib/config.js', () => ({ config: mocks.config }));

const ai = vi.hoisted(() => ({ real: false }));
vi.mock('./llmClient.js', () => ({ complete: mocks.complete }));
vi.mock('./aiService.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    evaluateAnswer: (...args) =>
      ai.real ? actual.evaluateAnswer(...args) : mocks.evaluateAnswer(...args),
  };
});

const { evaluateExplanation } = await import('./evaluationService.js');

const FIELDS = [
  'source',
  'is_correct',
  'explanation_quality',
  'detected_misconception',
  'needs_clarification',
  'hint',
  'feedback',
  'practice_tip',
].sort();

const challenge = loadFindMaxRow();
const aiFeedback = {
  is_correct: true,
  explanation_quality: 9,
  detected_misconception: null,
  needs_clarification: false,
  hint: null,
  feedback: 'Odlično.',
  practice_tip: null,
};

function context(explanation = 'Početna vrijednost, negativni brojevi.') {
  return {
    attemptId: 'attempt-1',
    challenge,
    answer: { selectedLines: [2], explanation },
    testSummary: { testsPassed: 4, testsTotal: 4 },
  };
}

beforeEach(() => {
  mocks.evaluateAnswer.mockReset();
  mocks.complete.mockReset();
  ai.real = false;
  mocks.config.aiStatus = 'available';
  mocks.config.demoMode = false;
});

describe('evaluateExplanation chain', () => {
  it('uses the AI when available', async () => {
    mocks.evaluateAnswer.mockResolvedValue(aiFeedback);
    const result = await evaluateExplanation(context());
    expect(result).toEqual({ source: 'ai', ...aiFeedback });
  });

  it('passes no attempt id to the AI service', async () => {
    mocks.evaluateAnswer.mockResolvedValue(aiFeedback);
    await evaluateExplanation(context());
    expect(JSON.stringify(mocks.evaluateAnswer.mock.calls[0])).not.toContain(
      'attempt-1',
    );
  });

  it('falls back when the AI throws', async () => {
    mocks.evaluateAnswer.mockRejectedValue(new Error('boom'));
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('fallback');
    expect(result.explanation_quality).toBe(7);
  });

  it('falls back when the AI times out (real aiService, hanging provider rejects)', async () => {
    ai.real = true;
    mocks.complete.mockRejectedValue(
      Object.assign(new Error('timeout'), { kind: 'timeout' }),
    );
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('fallback');
  });

  it('falls back when the AI returns invalid output twice', async () => {
    ai.real = true;
    mocks.complete.mockResolvedValue('garbage');
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('fallback');
    expect(mocks.complete).toHaveBeenCalledTimes(2);
  });

  it('uses the AI result with a clamped quality end to end', async () => {
    ai.real = true;
    mocks.complete.mockResolvedValue(
      JSON.stringify({ ...aiFeedback, explanation_quality: 42 }),
    );
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('ai');
    expect(result.explanation_quality).toBe(10);
  });

  it('with the AI unavailable never calls it', async () => {
    mocks.config.aiStatus = 'unavailable';
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('fallback');
    expect(mocks.evaluateAnswer).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('in demo mode returns the recorded response and never calls the AI', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    const result = await evaluateExplanation(context());
    expect(result.source).toBe('demo');
    expect(result.explanation_quality).toBe(8);
    expect(mocks.evaluateAnswer).not.toHaveBeenCalled();
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it('in demo mode falls back for a challenge without a recording', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    const result = await evaluateExplanation({
      ...context(),
      challenge: { ...challenge, id: 'other' },
    });
    expect(result.source).toBe('fallback');
  });

  it('does not throw on a missing context', async () => {
    mocks.evaluateAnswer.mockRejectedValue(new Error('no context'));
    const result = await evaluateExplanation(undefined);
    expect(result.source).toBe('fallback');
  });
});

describe('parity: ai, fallback and demo return every field', () => {
  function check(result, source) {
    expect(Object.keys(result).sort()).toEqual(FIELDS);
    expect(result.source).toBe(source);
    expect(typeof result.is_correct).toBe('boolean');
    expect(Number.isInteger(result.explanation_quality)).toBe(true);
    expect(result.explanation_quality).toBeGreaterThanOrEqual(0);
    expect(result.explanation_quality).toBeLessThanOrEqual(10);
    expect(['string', 'object']).toContain(
      typeof result.detected_misconception,
    );
    expect(typeof result.needs_clarification).toBe('boolean');
    expect(result.hint === null || typeof result.hint === 'string').toBe(true);
    expect(typeof result.feedback).toBe('string');
    expect(result.feedback.length).toBeGreaterThan(0);
    expect(
      result.practice_tip === null || typeof result.practice_tip === 'string',
    ).toBe(true);
  }

  it('ai', async () => {
    mocks.evaluateAnswer.mockResolvedValue(aiFeedback);
    check(await evaluateExplanation(context()), 'ai');
  });

  it('fallback', async () => {
    mocks.config.aiStatus = 'unavailable';
    check(await evaluateExplanation(context()), 'fallback');
  });

  it('demo', async () => {
    mocks.config.demoMode = true;
    mocks.config.aiStatus = 'demo';
    check(await evaluateExplanation(context()), 'demo');
  });
});
