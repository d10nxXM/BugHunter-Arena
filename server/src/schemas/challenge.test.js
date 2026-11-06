import { describe, it, expect } from 'vitest';
import {
  ChallengeSummarySchema,
  ChallengeListSchema,
  ChallengePublicSchema,
  VisibleTestSchema,
  ChallengeIdParamsSchema,
  ChallengeFileSchema,
  DifficultySchema,
  FALLBACK_FEEDBACK_MAX,
} from './challenge.js';
import { EvaluationResultSchema } from './aiOutput.js';
import { evaluateWithKeywords } from '../services/fallbackService.js';
import { HealthSchema } from './health.js';
import {
  API_DETAIL_EXAMPLE,
  API_LIST_EXAMPLE,
  HIDDEN_KEYS,
  loadFindMaxFile,
} from '../../test/fixtures.js';

const summary = API_LIST_EXAMPLE[0];

function without(obj, key) {
  const copy = { ...obj };
  delete copy[key];
  return copy;
}

describe('ChallengeSummarySchema', () => {
  it('accepts the API.md list item', () => {
    expect(ChallengeSummarySchema.parse(summary)).toEqual(summary);
  });

  it('rejects an extra field', () => {
    expect(() =>
      ChallengeSummarySchema.parse({ ...summary, referenceSolution: 'x' }),
    ).toThrow();
  });

  it('rejects a missing field', () => {
    expect(() =>
      ChallengeSummarySchema.parse(without(summary, 'title')),
    ).toThrow();
  });

  it('rejects an unknown language or difficulty', () => {
    expect(() =>
      ChallengeSummarySchema.parse({ ...summary, language: 'ruby' }),
    ).toThrow();
    expect(() =>
      ChallengeSummarySchema.parse({ ...summary, difficulty: 'lako' }),
    ).toThrow();
  });
});

describe('ChallengeListSchema', () => {
  it('accepts the API.md list and an empty list', () => {
    expect(ChallengeListSchema.parse(API_LIST_EXAMPLE)).toEqual(
      API_LIST_EXAMPLE,
    );
    expect(ChallengeListSchema.parse([])).toEqual([]);
  });

  it('rejects a list with an item that has an extra field', () => {
    expect(() =>
      ChallengeListSchema.parse([{ ...summary, bug_lines: [2] }]),
    ).toThrow();
  });

  it('rejects a non-array', () => {
    expect(() => ChallengeListSchema.parse(summary)).toThrow();
  });
});

describe('VisibleTestSchema', () => {
  it('accepts { id, args, expected } including expected null', () => {
    expect(
      VisibleTestSchema.parse({ id: 't1', args: [[2, 5, 1]], expected: 5 }),
    ).toEqual({
      id: 't1',
      args: [[2, 5, 1]],
      expected: 5,
    });
    expect(
      VisibleTestSchema.parse({ id: 't4', args: [[]], expected: null })
        .expected,
    ).toBeNull();
  });

  it('rejects the fields visible and failsOnOriginal', () => {
    const t = { id: 't1', args: [[1]], expected: 1 };
    expect(() => VisibleTestSchema.parse({ ...t, visible: true })).toThrow();
    expect(() =>
      VisibleTestSchema.parse({ ...t, failsOnOriginal: false }),
    ).toThrow();
  });

  it('rejects args that are not an array', () => {
    expect(() =>
      VisibleTestSchema.parse({ id: 't1', args: 5, expected: 1 }),
    ).toThrow();
  });
});

describe('ChallengePublicSchema', () => {
  it('accepts the API.md detail example', () => {
    expect(ChallengePublicSchema.parse(API_DETAIL_EXAMPLE)).toEqual(
      API_DETAIL_EXAMPLE,
    );
  });

  it.each(HIDDEN_KEYS)('rejects the hidden key "%s"', (key) => {
    expect(() =>
      ChallengePublicSchema.parse({ ...API_DETAIL_EXAMPLE, [key]: 'x' }),
    ).toThrow();
  });

  it('rejects a visible test that carries "visible"', () => {
    const bad = {
      ...API_DETAIL_EXAMPLE,
      visibleTests: [{ id: 't1', args: [[1]], expected: 1, visible: true }],
    };
    expect(() => ChallengePublicSchema.parse(bad)).toThrow();
  });

  it('rejects a missing field', () => {
    expect(() =>
      ChallengePublicSchema.parse(without(API_DETAIL_EXAMPLE, 'code')),
    ).toThrow();
  });

  it('rejects a negative or fractional hintCount', () => {
    expect(() =>
      ChallengePublicSchema.parse({ ...API_DETAIL_EXAMPLE, hintCount: -1 }),
    ).toThrow();
    expect(() =>
      ChallengePublicSchema.parse({ ...API_DETAIL_EXAMPLE, hintCount: 1.5 }),
    ).toThrow();
  });
});

describe('ChallengeIdParamsSchema', () => {
  it.each(['find-max', 'a', 'off-by-one-2', 'a'.repeat(64)])(
    'accepts "%s"',
    (id) => {
      expect(ChallengeIdParamsSchema.parse({ id })).toEqual({ id });
    },
  );

  it.each(['', 'a'.repeat(65), 'Find-Max', 'a_b', '../x', 'a b', 'a/b'])(
    'rejects "%s"',
    (id) => {
      expect(() => ChallengeIdParamsSchema.parse({ id })).toThrow();
    },
  );

  it('rejects a missing id', () => {
    expect(() => ChallengeIdParamsSchema.parse({})).toThrow();
  });
});

describe('ChallengeFileSchema', () => {
  const file = () => loadFindMaxFile();

  it('accepts the real find-max.json', () => {
    expect(() => ChallengeFileSchema.parse(file())).not.toThrow();
  });

  it('fallback_feedback: up to 2000 chars, longer is rejected', () => {
    expect(FALLBACK_FEEDBACK_MAX).toBe(2000);
    expect(file().fallback_feedback.length).toBeLessThanOrEqual(2000);
    const at = { ...file(), fallback_feedback: 'x'.repeat(2000) };
    expect(ChallengeFileSchema.safeParse(at).success).toBe(true);
    const over = { ...file(), fallback_feedback: 'x'.repeat(2001) };
    const result = ChallengeFileSchema.safeParse(over);
    expect(result.success).toBe(false);
    expect(result.error.issues.map((i) => i.path.join('.'))).toEqual([
      'fallback_feedback',
    ]);
  });

  it('a fallback built from the longest allowed text passes EvaluationResultSchema', () => {
    const challenge = { ...file(), fallback_feedback: 'x'.repeat(2000) };
    const out = {
      source: 'fallback',
      ...evaluateWithKeywords({ challenge, answer: { explanation: '' } }),
    };
    expect(EvaluationResultSchema.safeParse(out).success).toBe(true);
  });

  it('rejects a missing required field', () => {
    expect(() =>
      ChallengeFileSchema.parse(without(file(), 'reference_solution')),
    ).toThrow();
  });

  it('rejects a bad language or difficulty', () => {
    expect(() =>
      ChallengeFileSchema.parse({ ...file(), language: 'ruby' }),
    ).toThrow();
    expect(() =>
      ChallengeFileSchema.parse({ ...file(), difficulty: 'expert' }),
    ).toThrow();
  });

  it('rejects the old Montenegrin difficulty values', () => {
    for (const difficulty of ['lako', 'srednje', 'teško']) {
      expect(DifficultySchema.safeParse(difficulty).success).toBe(false);
      expect(() =>
        ChallengeFileSchema.parse({ ...file(), difficulty }),
      ).toThrow();
    }
  });

  it('accepts javascript and every English difficulty', () => {
    for (const difficulty of ['easy', 'medium', 'hard']) {
      expect(() =>
        ChallengeFileSchema.parse({ ...file(), difficulty }),
      ).not.toThrow();
    }
    expect(() =>
      ChallengeFileSchema.parse({ ...file(), language: 'javascript' }),
    ).not.toThrow();
  });

  it('rejects an empty title or empty bug_lines', () => {
    expect(() => ChallengeFileSchema.parse({ ...file(), title: '' })).toThrow();
    expect(() =>
      ChallengeFileSchema.parse({ ...file(), bug_lines: [] }),
    ).toThrow();
  });

  it('requires exactly 3 hints', () => {
    const f = file();
    expect(() =>
      ChallengeFileSchema.parse({ ...f, hints_json: f.hints_json.slice(0, 2) }),
    ).toThrow();
    expect(() =>
      ChallengeFileSchema.parse({
        ...f,
        hints_json: [...f.hints_json, 'extra'],
      }),
    ).toThrow();
  });

  it('requires exactly 3 non-empty keyword groups', () => {
    const f = file();
    expect(() =>
      ChallengeFileSchema.parse({
        ...f,
        keywords_json: f.keywords_json.slice(0, 2),
      }),
    ).toThrow();
    expect(() =>
      ChallengeFileSchema.parse({
        ...f,
        keywords_json: [...f.keywords_json.slice(0, 2), []],
      }),
    ).toThrow();
  });

  it('requires at least 2 visible tests', () => {
    const f = file();
    const tests = f.tests_json.map((t, i) =>
      i === 1 ? { ...t, visible: false } : t,
    );
    expect(() =>
      ChallengeFileSchema.parse({ ...f, tests_json: tests }),
    ).toThrow();
  });

  it('requires at least 1 hidden test', () => {
    const f = file();
    const tests = f.tests_json.map((t) => ({ ...t, visible: true }));
    expect(() =>
      ChallengeFileSchema.parse({ ...f, tests_json: tests }),
    ).toThrow();
  });

  it('rejects duplicate test ids', () => {
    const f = file();
    const tests = f.tests_json.map((t, i) =>
      i === 3 ? { ...t, id: 't1' } : t,
    );
    expect(() =>
      ChallengeFileSchema.parse({ ...f, tests_json: tests }),
    ).toThrow();
  });
});

describe('HealthSchema', () => {
  it.each(['available', 'unavailable', 'demo'])('accepts ai "%s"', (ai) => {
    const body = { status: 'ok', ai, demoMode: false };
    expect(HealthSchema.parse(body)).toEqual(body);
  });

  it('rejects an unknown ai value, status or extra field', () => {
    expect(() =>
      HealthSchema.parse({ status: 'ok', ai: 'maybe', demoMode: false }),
    ).toThrow();
    expect(() =>
      HealthSchema.parse({ status: 'down', ai: 'demo', demoMode: false }),
    ).toThrow();
    expect(() =>
      HealthSchema.parse({
        status: 'ok',
        ai: 'demo',
        demoMode: false,
        llmApiKey: 'x',
      }),
    ).toThrow();
  });

  it('rejects a non-boolean demoMode', () => {
    expect(() =>
      HealthSchema.parse({ status: 'ok', ai: 'demo', demoMode: 'false' }),
    ).toThrow();
  });
});
