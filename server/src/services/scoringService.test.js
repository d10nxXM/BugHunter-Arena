import { describe, it, expect } from 'vitest';
import {
  calculateScore,
  scoreLines,
  scoreEdgeCase,
  scoreFix,
  scoreExplanation,
  hintPenalty,
  jsonEqual,
  countPassedTests,
} from './scoringService.js';

const ORIGINAL =
  'def find_max(numbers):\n    max_value = 0\n    return max_value';
const tests = [
  {
    id: 't1',
    args: [[2, 5, 1]],
    expected: 5,
    visible: true,
    failsOnOriginal: false,
  },
  { id: 't2', args: [[7]], expected: 7, visible: true, failsOnOriginal: false },
  {
    id: 't3',
    args: [[-8, -3, -10]],
    expected: -3,
    visible: false,
    failsOnOriginal: true,
  },
  {
    id: 't4',
    args: [[]],
    expected: null,
    visible: false,
    failsOnOriginal: false,
  },
];
const pass = (id) => ({ id, passed: true, actual: null });
const fail = (id, extra = {}) => ({
  id,
  passed: false,
  actual: null,
  ...extra,
});

describe('worked example from docs/SCORING.md (find_max)', () => {
  it('totals 89', () => {
    const result = calculateScore({
      attempt: {
        selectedLines: [2],
        hintsUsed: 1,
        fixedCode:
          'def find_max(numbers):\n    return max(numbers, default=None)',
        edgeCase: { args: [[-8, -3, -10]], expected: -3 },
      },
      challenge: {
        bug_lines: [2],
        related_lines: [],
        tests_json: tests,
        code: ORIGINAL,
      },
      explanationQuality: 8,
      edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null },
      testResults: ['t1', 't2', 't3', 't4'].map(pass),
    });
    expect(result).toEqual({
      total: 89,
      breakdown: {
        lineIdentification: 40,
        explanation: 24,
        edgeCase: 20,
        fix: 10,
        hintPenalty: -5,
      },
    });
  });
});

describe('scoreLines', () => {
  it('counts distinct lines: repeated lines do not exceed the cap', () => {
    expect(scoreLines([2, 2, 2, 2], [2], [])).toBe(40);
    expect(scoreLines([1, 2, 3, 3], [2], [])).toBe(40);
    expect(scoreLines([1, 2, 3, 4], [2], [])).toBe(20);
  });

  it('40 for a bug line among at most 3 lines (boundary 3)', () => {
    expect(scoreLines([2], [2], [])).toBe(40);
    expect(scoreLines([1, 2, 3], [2], [])).toBe(40);
  });
  it('20 for a bug line among more than 3 (boundary 4)', () => {
    expect(scoreLines([1, 2, 3, 4], [2], [])).toBe(20);
  });
  it('20 for only a related line', () => {
    expect(scoreLines([3], [2], [3])).toBe(20);
  });
  it('bug line wins over related line', () => {
    expect(scoreLines([2, 3], [2], [3])).toBe(40);
  });
  it('0 otherwise, including empty and missing input', () => {
    expect(scoreLines([5], [2], [3])).toBe(0);
    expect(scoreLines([], [2], [3])).toBe(0);
    expect(scoreLines(null, [2], [3])).toBe(0);
    expect(scoreLines([2], undefined, undefined)).toBe(0);
  });
});

describe('scoreExplanation', () => {
  it('round(quality * 3)', () => {
    expect(scoreExplanation(0)).toBe(0);
    expect(scoreExplanation(7)).toBe(21);
    expect(scoreExplanation(8)).toBe(24);
    expect(scoreExplanation(10)).toBe(30);
    expect(scoreExplanation(3.5)).toBe(11);
  });
  it('clamps to 0-10 so the AI share is at most 30', () => {
    expect(scoreExplanation(15)).toBe(30);
    expect(scoreExplanation(-2)).toBe(0);
  });
  it('treats non-numbers as 0', () => {
    expect(scoreExplanation(null)).toBe(0);
    expect(scoreExplanation(undefined)).toBe(0);
    expect(scoreExplanation(NaN)).toBe(0);
    expect(scoreExplanation('9')).toBe(0);
  });
});

describe('jsonEqual', () => {
  it('compares numbers by value', () => {
    expect(jsonEqual(1, 1.0)).toBe(true);
    expect(jsonEqual(1, 2)).toBe(false);
  });
  it('booleans equal only booleans', () => {
    expect(jsonEqual(true, 1)).toBe(false);
    expect(jsonEqual(false, 0)).toBe(false);
    expect(jsonEqual(true, true)).toBe(true);
  });
  it('null only equals null', () => {
    expect(jsonEqual(null, null)).toBe(true);
    expect(jsonEqual(null, 0)).toBe(false);
    expect(jsonEqual(null, undefined)).toBe(false);
  });
  it('lists element by element in order, nested', () => {
    expect(jsonEqual([1, [2, 3]], [1, [2, 3]])).toBe(true);
    expect(jsonEqual([1, 2], [2, 1])).toBe(false);
    expect(jsonEqual([1], [1, 2])).toBe(false);
    expect(jsonEqual([], [])).toBe(true);
  });
  it('objects by keys in any order', () => {
    expect(jsonEqual({ a: 1, b: [2] }, { b: [2], a: 1 })).toBe(true);
    expect(jsonEqual({ a: 1 }, { a: 1, b: 2 })).toBe(false);
    expect(jsonEqual({ a: 1 }, { b: 1 })).toBe(false);
  });
  it('list never equals object', () => {
    expect(jsonEqual([], {})).toBe(false);
  });
  it('strings by value', () => {
    expect(jsonEqual('a', 'a')).toBe(true);
    expect(jsonEqual('1', 1)).toBe(false);
  });
  it('NaN, Infinity and non-JSON values never match', () => {
    expect(jsonEqual(NaN, NaN)).toBe(false);
    expect(jsonEqual(Infinity, Infinity)).toBe(false);
    expect(jsonEqual(new Set([1]), new Set([1]))).toBe(false);
    expect(jsonEqual(undefined, undefined)).toBe(false);
    expect(jsonEqual([NaN], [NaN])).toBe(false);
  });
});

describe('scoreEdgeCase', () => {
  const check = { originalOutput: 0, referenceOutput: -3, error: null };
  it('20 when it exposes the bug and expected is correct', () => {
    expect(scoreEdgeCase(check, -3)).toBe(20);
  });
  it('10 when it exposes the bug but expected is wrong', () => {
    expect(scoreEdgeCase(check, 0)).toBe(10);
  });
  it('0 when original and reference agree', () => {
    expect(
      scoreEdgeCase({ originalOutput: 5, referenceOutput: 5, error: null }, 5),
    ).toBe(0);
  });
  it('compares as JSON: 1 == 1.0, null, booleans', () => {
    expect(
      scoreEdgeCase(
        { originalOutput: 1.0, referenceOutput: 1, error: null },
        1,
      ),
    ).toBe(0);
    expect(
      scoreEdgeCase(
        { originalOutput: 0, referenceOutput: null, error: null },
        null,
      ),
    ).toBe(20);
    expect(
      scoreEdgeCase(
        { originalOutput: false, referenceOutput: 0, error: null },
        0,
      ),
    ).toBe(20);
  });
  it('original raising while reference does not exposes the bug', () => {
    const raised = {
      originalOutput: null,
      referenceOutput: 3,
      error: 'IndexError',
    };
    expect(scoreEdgeCase(raised, 3)).toBe(20);
    expect(scoreEdgeCase(raised, 4)).toBe(10);
  });
  it('0 for missing check', () => {
    expect(scoreEdgeCase(null, 1)).toBe(0);
    expect(scoreEdgeCase(undefined, 1)).toBe(0);
  });
  it('compares lists by value', () => {
    const c = { originalOutput: [1], referenceOutput: [1, 2], error: null };
    expect(scoreEdgeCase(c, [1, 2])).toBe(20);
  });
});

describe('scoreFix', () => {
  const fixed = 'def find_max(n):\n    return max(n, default=None)';
  it('10 when all tests pass', () => {
    expect(
      scoreFix(['t1', 't2', 't3', 't4'].map(pass), tests, fixed, ORIGINAL),
    ).toBe(10);
  });
  it('5 when a failsOnOriginal test passes but not all', () => {
    const r = [pass('t1'), pass('t2'), pass('t3'), fail('t4')];
    expect(scoreFix(r, tests, fixed, ORIGINAL)).toBe(5);
  });
  it('0 when only tests that already passed on the original pass', () => {
    const r = [pass('t1'), pass('t2'), fail('t3'), pass('t4')];
    expect(scoreFix(r, tests, fixed, ORIGINAL)).toBe(0);
  });
  it('a timeout counts as failed even if passed is true', () => {
    const r = [
      pass('t1'),
      pass('t2'),
      { id: 't3', passed: true, actual: null, error: 'timeout' },
      pass('t4'),
    ];
    expect(scoreFix(r, tests, fixed, ORIGINAL)).toBe(0);
  });
  it('a timeout on the only fails-on-original test gives 0, not 5', () => {
    const r = [
      pass('t1'),
      pass('t2'),
      fail('t3', { error: 'timeout' }),
      fail('t4'),
    ];
    expect(scoreFix(r, tests, fixed, ORIGINAL)).toBe(0);
  });
  it('a missing result counts as failed', () => {
    expect(
      scoreFix([pass('t1'), pass('t2'), pass('t3')], tests, fixed, ORIGINAL),
    ).toBe(5);
  });
  it('unknown result ids are ignored', () => {
    expect(scoreFix([pass('zz')], tests, fixed, ORIGINAL)).toBe(0);
  });
  it('0 when the fix equals the original ignoring whitespace', () => {
    const same =
      '  def find_max(numbers):\n\n  max_value   = 0\n return max_value ';
    expect(
      scoreFix(['t1', 't2', 't3', 't4'].map(pass), tests, same, ORIGINAL),
    ).toBe(0);
  });
  it('0 for empty or missing results and empty test list', () => {
    expect(scoreFix([], tests, fixed, ORIGINAL)).toBe(0);
    expect(scoreFix(undefined, tests, fixed, ORIGINAL)).toBe(0);
    expect(scoreFix([], [], fixed, ORIGINAL)).toBe(0);
  });
  it('passed must be strictly true', () => {
    const r = ['t1', 't2', 't3', 't4'].map((id) => ({
      id,
      passed: 1,
      actual: null,
    }));
    expect(scoreFix(r, tests, fixed, ORIGINAL)).toBe(0);
  });
});

describe('countPassedTests', () => {
  it('counts passed tests of the challenge, timeouts excluded', () => {
    const r = [
      pass('t1'),
      fail('t2'),
      { id: 't3', passed: true, error: 'timeout' },
      pass('t4'),
    ];
    expect(countPassedTests(r, tests)).toEqual({
      testsPassed: 2,
      testsTotal: 4,
    });
  });
  it('handles missing results', () => {
    expect(countPassedTests(undefined, tests)).toEqual({
      testsPassed: 0,
      testsTotal: 4,
    });
  });
});

describe('hintPenalty', () => {
  it('0, 5, 10, 20 for 0-3 hints', () => {
    expect([0, 1, 2, 3].map(hintPenalty)).toEqual([0, 5, 10, 20]);
  });
  it('rejects out-of-range or non-integer values', () => {
    for (const bad of [-1, 4, 1.5, '1', null, undefined]) {
      expect(() => hintPenalty(bad)).toThrow(RangeError);
    }
  });
});

describe('calculateScore totals', () => {
  const base = {
    attempt: {
      selectedLines: [2],
      hintsUsed: 0,
      fixedCode: 'x = 1',
      edgeCase: { args: [], expected: 1 },
    },
    challenge: {
      bug_lines: [2],
      related_lines: [],
      tests_json: tests,
      code: ORIGINAL,
    },
    explanationQuality: 10,
    edgeCaseCheck: { originalOutput: 0, referenceOutput: 1, error: null },
    testResults: ['t1', 't2', 't3', 't4'].map(pass),
  };
  it('perfect answer is 100', () => {
    expect(calculateScore(base).total).toBe(100);
  });
  it('clamps at 0 when penalty exceeds points', () => {
    const r = calculateScore({
      ...base,
      attempt: { ...base.attempt, selectedLines: [9], hintsUsed: 3 },
      explanationQuality: 0,
      edgeCaseCheck: { originalOutput: 1, referenceOutput: 1, error: null },
      testResults: [],
    });
    expect(r.total).toBe(0);
    expect(r.breakdown.hintPenalty).toBe(-20);
  });
  it('AI share is capped at 30 even with quality above 10', () => {
    expect(
      calculateScore({ ...base, explanationQuality: 99 }).breakdown.explanation,
    ).toBe(30);
  });
  it('an attempt without edgeCase never scores 20; 0 if the check does not expose the bug', () => {
    const attempt = { ...base.attempt, edgeCase: undefined };
    const same = { originalOutput: 1, referenceOutput: 1, error: null };
    expect(
      calculateScore({ ...base, attempt, edgeCaseCheck: same }).breakdown
        .edgeCase,
    ).toBe(0);
    // Exposing check, missing expected value: "expected wrong" = 10 (SCORING.md).
    expect(calculateScore({ ...base, attempt }).breakdown.edgeCase).toBe(10);
  });
  it('3 hints subtract 20', () => {
    const r = calculateScore({
      ...base,
      attempt: { ...base.attempt, hintsUsed: 3 },
    });
    expect(r.total).toBe(80);
  });
  it('is pure: does not mutate input', () => {
    const copy = structuredClone(base);
    calculateScore(base);
    expect(base).toEqual(copy);
  });
});
