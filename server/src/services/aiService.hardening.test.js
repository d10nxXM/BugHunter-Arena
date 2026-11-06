import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loadFindMaxRow } from '../../test/fixtures.js';

const mocks = vi.hoisted(() => ({
  complete: vi.fn(),
  config: { aiStatus: 'available', aiTimeoutMs: 15000 },
}));
vi.mock('../lib/config.js', () => ({ config: mocks.config }));
vi.mock('./llmClient.js', () => ({ complete: mocks.complete }));

const { evaluateAnswer, getHint, revealsSolution, describeAiFailure } =
  await import('./aiService.js');

const challenge = loadFindMaxRow();
const goodOutput = {
  is_correct: true,
  explanation_quality: 8,
  detected_misconception: null,
  needs_clarification: false,
  hint: null,
  feedback: 'Good explanation.',
  practice_tip: null,
};
const context = () => ({
  challenge,
  answer: { selectedLines: [2], explanation: 'The starting value 0.' },
  testSummary: { testsPassed: 2, testsTotal: 4 },
});

beforeEach(() => {
  mocks.complete.mockReset();
  mocks.config.aiTimeoutMs = 15000;
});

describe('hint request contents (B1)', () => {
  it('contains no bug_description or other hidden field', async () => {
    mocks.complete.mockResolvedValue('{"hint":"Try negative numbers."}');
    await getHint({ challenge }, 2);
    const { user, system } = mocks.complete.mock.calls[0][0];
    const sent = user + system;
    expect(sent).not.toContain(challenge.bug_description);
    expect(sent).not.toContain('expected_bug');
    expect(sent).not.toContain('bug_lines');
    expect(sent).not.toContain('keywords');
    expect(sent).not.toContain(challenge.fallback_feedback);
    expect(user).toContain(challenge.hints_json[1]);
  });

  it('the evaluation request still has the expected bug', async () => {
    mocks.complete.mockResolvedValue(JSON.stringify(goodOutput));
    await evaluateAnswer(context());
    expect(mocks.complete.mock.calls[0][0].user).toContain(
      challenge.bug_description,
    );
  });
});

describe('revealsSolution (S2)', () => {
  it.each(['Probaj `x`.', 'Evo:\n```\ncode\n```'])(
    'rejects hint with backticks: %s',
    async (hint) => {
      mocks.complete.mockResolvedValue(JSON.stringify({ hint }));
      await expect(getHint({ challenge }, 1)).rejects.toMatchObject({
        kind: 'leaks_solution',
      });
    },
  );

  it('rejects short reference lines that are not in the original', () => {
    const c = {
      code: 'x = 1\nreturn x',
      reference_solution: 'x = 1\nif y:\nelse:\nreturn x',
    };
    expect(revealsSolution('stavi if y: negdje', c)).toBe(true);
    expect(revealsSolution('koristi else: grananje', c)).toBe(true);
  });

  it('allows lines already in the original and trivial lines', () => {
    const c = {
      code: 'x = 1\nreturn x',
      reference_solution: 'x = 1\n  \n):\nreturn x',
    };
    expect(revealsSolution('x = 1 is the start', c)).toBe(false);
    expect(revealsSolution('zagrade ): i prazno', c)).toBe(false);
  });
});

describe('is_correct derivation (S3)', () => {
  it('derives is_correct from the clamped quality', async () => {
    mocks.complete.mockResolvedValue(
      JSON.stringify({ ...goodOutput, explanation_quality: 6 }),
    );
    expect((await evaluateAnswer(context())).is_correct).toBe(false);
    mocks.complete.mockResolvedValue(
      JSON.stringify({
        ...goodOutput,
        explanation_quality: 99,
        is_correct: false,
      }),
    );
    expect((await evaluateAnswer(context())).is_correct).toBe(true);
    const noFlag = { ...goodOutput };
    delete noFlag.is_correct;
    mocks.complete.mockResolvedValue(JSON.stringify(noFlag));
    expect((await evaluateAnswer(context())).is_correct).toBe(true);
  });

  it('accepts needs_clarification without a hint', async () => {
    mocks.complete.mockResolvedValue(
      JSON.stringify({
        ...goodOutput,
        explanation_quality: 1,
        needs_clarification: true,
        hint: null,
      }),
    );
    const result = await evaluateAnswer(context());
    expect(result.needs_clarification).toBe(true);
    expect(result.hint).toBeNull();
    expect(result.is_correct).toBe(false);
  });
});

describe('timeouts and test counts (S7)', () => {
  it('hint timeout is the smaller of 8 s and AI_TIMEOUT_MS', async () => {
    mocks.complete.mockResolvedValue('{"hint":"Try negative numbers."}');
    mocks.config.aiTimeoutMs = 3000;
    await getHint({ challenge }, 1);
    expect(mocks.complete.mock.calls[0][0].timeoutMs).toBe(3000);
  });

  it('omits test_results when the counts are not finite numbers', async () => {
    mocks.complete.mockResolvedValue(JSON.stringify(goodOutput));
    await evaluateAnswer({ ...context(), testSummary: { testsPassed: NaN } });
    await evaluateAnswer({ ...context(), testSummary: undefined });
    await evaluateAnswer(context());
    const users = mocks.complete.mock.calls.map((c) => c[0].user);
    expect(users[0]).not.toContain('test_results');
    expect(users[1]).not.toContain('test_results');
    expect(users[2]).toContain('2 of 4 tests passed');
  });
});

describe('error kinds (S8)', () => {
  it('a second failure keeps the first error as cause', async () => {
    mocks.complete
      .mockResolvedValueOnce('not json')
      .mockResolvedValueOnce('{"feedback": 1}');
    const err = await evaluateAnswer(context()).catch((e) => e);
    expect(err.kind).toBe('schema');
    expect(err.cause.kind).toBe('invalid_json');
  });
});

describe('describeAiFailure (S4)', () => {
  it.each([
    [{ kind: 'http', status: 401 }, 'error'],
    [{ kind: 'http', status: 400 }, 'error'],
    [{ kind: 'http', status: 403 }, 'error'],
    [{ kind: 'http', status: 404 }, 'error'],
    [{ kind: 'http', status: 429 }, 'warn'],
    [{ kind: 'http', status: 503 }, 'warn'],
    [{ kind: 'timeout', status: null }, 'warn'],
    [new Error('x'), 'warn'],
  ])('%j -> %s', (err, level) => {
    expect(describeAiFailure(err).level).toBe(level);
  });

  it('exposes only reason and status', () => {
    const { fields } = describeAiFailure(
      Object.assign(new Error('https://secret.example SECRET'), {
        kind: 'http',
        status: 401,
      }),
    );
    expect(fields).toEqual({ reason: 'http', status: 401 });
  });
});
