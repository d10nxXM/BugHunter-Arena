import { describe, it, expect } from 'vitest';
import {
  CreateAttemptSchema,
  EvaluationSchema,
  AttemptIdParamsSchema,
  ProgressQuerySchema,
  AttemptListQuerySchema,
  CreateUserSchema,
} from './attempt.js';

const UUID = 'a3f1c2d4-5e6f-4a7b-8c9d-0e1f2a3b4c5d';

const valid = () => ({
  challengeId: 'find-max',
  userId: null,
  selectedLines: [2],
  explanation: 'a'.repeat(20),
  edgeCase: { args: [[-8, -3, -10]], expected: -3 },
  fixedCode: 'def f():\n    pass',
  hintsUsed: 1,
  durationSec: 184,
});
const ok = (schema, v) => schema.safeParse(v).success;

describe('CreateAttemptSchema', () => {
  it('selectedLines: duplicates are removed', () => {
    const r = CreateAttemptSchema.parse({
      ...valid(),
      selectedLines: [2, 2, 3, 2],
    });
    expect(r.selectedLines).toEqual([2, 3]);
  });

  it('accepts the example from docs/API.md', () => {
    expect(ok(CreateAttemptSchema, valid())).toBe(true);
  });
  it('accepts a uuid userId and defaults a missing userId to null', () => {
    expect(ok(CreateAttemptSchema, { ...valid(), userId: UUID })).toBe(true);
    const rest = valid();
    delete rest.userId;
    expect(CreateAttemptSchema.parse(rest).userId).toBeNull();
  });
  it('rejects a non-string, non-null userId', () => {
    expect(ok(CreateAttemptSchema, { ...valid(), userId: 5 })).toBe(false);
    expect(ok(CreateAttemptSchema, { ...valid(), userId: '' })).toBe(false);
  });

  it('challengeId must match [a-z0-9-]{1,64}', () => {
    expect(
      ok(CreateAttemptSchema, { ...valid(), challengeId: 'a'.repeat(64) }),
    ).toBe(true);
    for (const bad of ['', 'a'.repeat(65), 'Find_Max', '../x', undefined]) {
      expect(ok(CreateAttemptSchema, { ...valid(), challengeId: bad })).toBe(
        false,
      );
    }
  });

  it('selectedLines: 1-10 positive integers', () => {
    const lines = (n) => Array.from({ length: n }, (_, i) => i + 1);
    expect(
      ok(CreateAttemptSchema, { ...valid(), selectedLines: lines(1) }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), selectedLines: lines(10) }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), selectedLines: lines(11) }),
    ).toBe(false);
    expect(ok(CreateAttemptSchema, { ...valid(), selectedLines: [] })).toBe(
      false,
    );
    for (const bad of [[0], [-1], [1.5], ['2'], [null]]) {
      expect(ok(CreateAttemptSchema, { ...valid(), selectedLines: bad })).toBe(
        false,
      );
    }
    expect(ok(CreateAttemptSchema, { ...valid(), selectedLines: null })).toBe(
      false,
    );
  });

  it('explanation: 20-1000 chars', () => {
    expect(
      ok(CreateAttemptSchema, { ...valid(), explanation: 'a'.repeat(19) }),
    ).toBe(false);
    expect(
      ok(CreateAttemptSchema, { ...valid(), explanation: 'a'.repeat(20) }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), explanation: 'a'.repeat(1000) }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), explanation: 'a'.repeat(1001) }),
    ).toBe(false);
    expect(ok(CreateAttemptSchema, { ...valid(), explanation: null })).toBe(
      false,
    );
  });
  it('explanation made of whitespace does not count toward the minimum', () => {
    expect(
      ok(CreateAttemptSchema, { ...valid(), explanation: ' '.repeat(30) }),
    ).toBe(false);
  });

  it('fixedCode: up to 5000 chars', () => {
    expect(
      ok(CreateAttemptSchema, { ...valid(), fixedCode: 'x'.repeat(5000) }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), fixedCode: 'x'.repeat(5001) }),
    ).toBe(false);
    expect(ok(CreateAttemptSchema, { ...valid(), fixedCode: '' })).toBe(true);
    expect(ok(CreateAttemptSchema, { ...valid(), fixedCode: undefined })).toBe(
      false,
    );
  });

  it('hintsUsed: integer 0-3', () => {
    for (const n of [0, 1, 2, 3]) {
      expect(ok(CreateAttemptSchema, { ...valid(), hintsUsed: n })).toBe(true);
    }
    for (const bad of [-1, 4, 1.5, '1', null]) {
      expect(ok(CreateAttemptSchema, { ...valid(), hintsUsed: bad })).toBe(
        false,
      );
    }
  });

  it('durationSec: number >= 0', () => {
    expect(ok(CreateAttemptSchema, { ...valid(), durationSec: 0 })).toBe(true);
    expect(ok(CreateAttemptSchema, { ...valid(), durationSec: -1 })).toBe(
      false,
    );
    expect(ok(CreateAttemptSchema, { ...valid(), durationSec: NaN })).toBe(
      false,
    );
    expect(ok(CreateAttemptSchema, { ...valid(), durationSec: '5' })).toBe(
      false,
    );
  });

  it('edgeCase: args array and expected JSON value (null allowed)', () => {
    expect(
      ok(CreateAttemptSchema, {
        ...valid(),
        edgeCase: { args: [], expected: null },
      }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, {
        ...valid(),
        edgeCase: { args: [[]], expected: [] },
      }),
    ).toBe(true);
    expect(
      ok(CreateAttemptSchema, { ...valid(), edgeCase: { args: [] } }),
    ).toBe(false);
    expect(
      ok(CreateAttemptSchema, { ...valid(), edgeCase: { expected: 1 } }),
    ).toBe(false);
    expect(
      ok(CreateAttemptSchema, {
        ...valid(),
        edgeCase: { args: 'x', expected: 1 },
      }),
    ).toBe(false);
    expect(ok(CreateAttemptSchema, { ...valid(), edgeCase: null })).toBe(false);
  });

  it('rejects each missing required field', () => {
    for (const key of [
      'challengeId',
      'selectedLines',
      'explanation',
      'edgeCase',
      'fixedCode',
      'hintsUsed',
      'durationSec',
    ]) {
      const v = valid();
      delete v[key];
      expect(ok(CreateAttemptSchema, v), key).toBe(false);
    }
  });
  it('rejects empty and non-object bodies', () => {
    expect(ok(CreateAttemptSchema, {})).toBe(false);
    expect(ok(CreateAttemptSchema, null)).toBe(false);
    expect(ok(CreateAttemptSchema, undefined)).toBe(false);
  });
});

describe('EvaluationSchema', () => {
  const evalBody = () => ({
    testResults: [
      { id: 't1', passed: true, actual: 5 },
      { id: 't2', passed: false, actual: null, error: 'timeout' },
    ],
    edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null },
  });
  it('accepts the example from docs/API.md', () => {
    expect(ok(EvaluationSchema, evalBody())).toBe(true);
  });
  it('accepts null outputs and an error string', () => {
    const v = evalBody();
    v.edgeCaseCheck = {
      originalOutput: null,
      referenceOutput: null,
      error: 'IndexError',
    };
    expect(ok(EvaluationSchema, v)).toBe(true);
  });
  it('error is optional on edgeCaseCheck and tests', () => {
    const v = evalBody();
    v.edgeCaseCheck = { originalOutput: 1, referenceOutput: 2 };
    expect(ok(EvaluationSchema, v)).toBe(true);
  });
  it('accepts an empty testResults list', () => {
    expect(ok(EvaluationSchema, { ...evalBody(), testResults: [] })).toBe(true);
  });
  it('rejects bad test result shapes', () => {
    for (const bad of [
      { passed: true, actual: 1 },
      { id: '', passed: true, actual: 1 },
      { id: 't1', passed: 'yes', actual: 1 },
      { id: 't1', passed: 1, actual: 1 },
      { id: 't1', passed: true, actual: 1, error: 5 },
    ]) {
      expect(ok(EvaluationSchema, { ...evalBody(), testResults: [bad] })).toBe(
        false,
      );
    }
  });
  it('rejects too many results', () => {
    const many = Array.from({ length: 101 }, (_, i) => ({
      id: `t${i}`,
      passed: true,
      actual: null,
    }));
    expect(ok(EvaluationSchema, { ...evalBody(), testResults: many })).toBe(
      false,
    );
  });
  it('rejects missing fields', () => {
    expect(ok(EvaluationSchema, { testResults: [] })).toBe(false);
    expect(
      ok(EvaluationSchema, { edgeCaseCheck: evalBody().edgeCaseCheck }),
    ).toBe(false);
    expect(
      ok(EvaluationSchema, {
        ...evalBody(),
        edgeCaseCheck: { referenceOutput: 1 },
      }),
    ).toBe(false);
    expect(ok(EvaluationSchema, null)).toBe(false);
  });
});

describe('AttemptIdParamsSchema', () => {
  it('accepts a uuid and rejects anything else', () => {
    expect(ok(AttemptIdParamsSchema, { id: UUID })).toBe(true);
    expect(ok(AttemptIdParamsSchema, { id: 'abc' })).toBe(false);
    expect(ok(AttemptIdParamsSchema, {})).toBe(false);
  });
});

describe('ProgressQuerySchema', () => {
  it('userId is an optional uuid (required without a token, in the service)', () => {
    expect(ok(ProgressQuerySchema, { userId: UUID })).toBe(true);
    expect(ok(ProgressQuerySchema, {})).toBe(true);
    expect(ok(ProgressQuerySchema, { userId: '' })).toBe(false);
    expect(ok(ProgressQuerySchema, { userId: 'x' })).toBe(false);
  });
});

describe('AttemptListQuerySchema', () => {
  it('userId optional (service requires it without a token), challengeId optional', () => {
    expect(ok(AttemptListQuerySchema, { userId: UUID })).toBe(true);
    expect(
      ok(AttemptListQuerySchema, { userId: UUID, challengeId: 'find-max' }),
    ).toBe(true);
    expect(ok(AttemptListQuerySchema, { challengeId: 'find-max' })).toBe(true);
    expect(ok(AttemptListQuerySchema, { userId: 'x' })).toBe(false);
    expect(
      ok(AttemptListQuerySchema, { userId: UUID, challengeId: 'Bad Id' }),
    ).toBe(false);
  });

  it('limit defaults to 50 and coerces query strings', () => {
    expect(AttemptListQuerySchema.parse({ userId: UUID }).limit).toBe(50);
    expect(
      AttemptListQuerySchema.parse({ userId: UUID, limit: '100' }).limit,
    ).toBe(100);
    expect(
      AttemptListQuerySchema.parse({ userId: UUID, limit: '1' }).limit,
    ).toBe(1);
  });

  it.each([0, 101, '0', '101', '1.5', '', 'abc', '-1'])(
    'rejects limit %j',
    (limit) => {
      expect(ok(AttemptListQuerySchema, { userId: UUID, limit })).toBe(false);
    },
  );

  it.each([
    '2026-11-03T12:00:00Z',
    '2026-11-03T12:00:00.123Z',
    '2026-11-03T12:00:00+00:00',
    '2026-11-03T12:00:00.123456+00:00',
  ])('accepts cursor %s', (cursor) => {
    const parsed = AttemptListQuerySchema.parse({ userId: UUID, cursor });
    expect(parsed.cursor).toBe(cursor);
  });

  it('cursor is optional', () => {
    expect(
      AttemptListQuerySchema.parse({ userId: UUID }).cursor,
    ).toBeUndefined();
  });

  it.each(['yesterday', '2026-11-03', '', '2026-11-03T12:00:00'])(
    'rejects cursor %j',
    (cursor) => {
      expect(ok(AttemptListQuerySchema, { userId: UUID, cursor })).toBe(false);
    },
  );
});

describe('AttemptListQuerySchema cursorId', () => {
  const CURSOR = '2026-11-03T12:00:00.123456+00:00';
  const ID = '22222222-2222-4222-8222-222222222222';

  it('accepts cursor with cursorId', () => {
    const parsed = AttemptListQuerySchema.parse({
      userId: UUID,
      cursor: CURSOR,
      cursorId: ID,
    });
    expect(parsed.cursor).toBe(CURSOR);
    expect(parsed.cursorId).toBe(ID);
  });

  it('cursorId is optional', () => {
    expect(
      AttemptListQuerySchema.parse({ userId: UUID, cursor: CURSOR }).cursorId,
    ).toBeUndefined();
  });

  it('rejects cursorId without cursor', () => {
    expect(ok(AttemptListQuerySchema, { userId: UUID, cursorId: ID })).toBe(
      false,
    );
  });

  it.each(['abc', '', '123', `${ID}x`])('rejects cursorId %j', (cursorId) => {
    expect(
      ok(AttemptListQuerySchema, { userId: UUID, cursor: CURSOR, cursorId }),
    ).toBe(false);
  });

  it('rejects cursorId with an invalid cursor', () => {
    expect(
      ok(AttemptListQuerySchema, {
        userId: UUID,
        cursor: 'yesterday',
        cursorId: ID,
      }),
    ).toBe(false);
  });
});

describe('CreateUserSchema', () => {
  it('displayName 2-32 chars', () => {
    expect(ok(CreateUserSchema, { displayName: 'a' })).toBe(false);
    expect(ok(CreateUserSchema, { displayName: 'ab' })).toBe(true);
    expect(ok(CreateUserSchema, { displayName: 'a'.repeat(32) })).toBe(true);
    expect(ok(CreateUserSchema, { displayName: 'a'.repeat(33) })).toBe(false);
  });
  it('trims, rejects blank and missing', () => {
    expect(CreateUserSchema.parse({ displayName: '  dion ' }).displayName).toBe(
      'dion',
    );
    expect(ok(CreateUserSchema, { displayName: '   ' })).toBe(false);
    expect(ok(CreateUserSchema, {})).toBe(false);
    expect(ok(CreateUserSchema, { displayName: null })).toBe(false);
  });
});
