import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAttempt, submitEvaluation } from '../api/client.js';
import { attemptCreated, evaluationAi, findMaxPublic } from '../api/mocks/fixtures.js';
import {
  ATTEMPT_ID,
  EXPLANATION,
  FIXED_CODE,
  USER_ID,
  fillAnswer,
  makeRunner,
  registerChallengePageMocks,
  renderReady,
  resultState,
  submitButton,
} from '../test-utils/challengePageSetup.jsx';

// Real Monaco does not run in jsdom: keep the real CodeEditor, fake only the Monaco module.
vi.mock('../workers/monacoSetup.js', async () => ({
  monaco: (await import('../test-utils/fakeMonaco.js')).fakeMonaco,
}));

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenge: vi.fn(),
  requestHint: vi.fn(),
  createAttempt: vi.fn(),
  submitEvaluation: vi.fn(),
  getAttempts: vi.fn(),
}));

registerChallengePageMocks();

describe('ChallengePage submit', () => {
  it('creates the attempt, runs all tests, evaluates and navigates with the ResultState', async () => {
    const user = userEvent.setup();
    const { runner } = await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');

    expect(createAttempt).toHaveBeenCalledTimes(1);
    expect(createAttempt.mock.calls[0][0]).toEqual({
      challengeId: 'find-max',
      userId: USER_ID,
      selectedLines: [2],
      explanation: EXPLANATION,
      edgeCase: { args: [[-8, -3, -10]], expected: -3 },
      fixedCode: FIXED_CODE,
      hintsUsed: 0,
      durationSec: expect.any(Number),
    });

    const edgeTest = [{ id: 'edge-case', args: [[-8, -3, -10]], expected: -3 }];
    expect(runner.run.mock.calls.map(([arg]) => arg)).toEqual([
      { code: attemptCreated.referenceSolution, functionName: 'find_max', tests: edgeTest },
      { code: findMaxPublic.code, functionName: 'find_max', tests: edgeTest },
      {
        code: FIXED_CODE,
        functionName: 'find_max',
        tests: attemptCreated.tests.map(({ id, args, expected }) => ({ id, args, expected })),
      },
    ]);

    const testResults = [
      { id: 't1', passed: true, actual: 5, error: null },
      { id: 't2', passed: true, actual: 7, error: null },
      { id: 't3', passed: true, actual: -3, error: null },
      { id: 't4', passed: true, actual: null, error: null },
    ];
    expect(submitEvaluation).toHaveBeenCalledWith(
      ATTEMPT_ID,
      { testResults, edgeCaseCheck: { originalOutput: 0, referenceOutput: -3, error: null } },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(resultState()).toEqual({
      attemptId: ATTEMPT_ID,
      challengeId: 'find-max',
      tests: attemptCreated.tests,
      testResults,
      evaluation: evaluationAi,
      referenceSolution: attemptCreated.referenceSolution,
    });
  });

  it('allows an anonymous submit with userId null', async () => {
    const user = userEvent.setup();
    await renderReady({ withUser: false });
    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');
    expect(createAttempt.mock.calls[0][0].userId).toBeNull();
  });

  it('sends the original error when the original code raises for the edge case', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockImplementation(async (arg) =>
      arg.code === findMaxPublic.code
        ? {
            timedOut: false,
            results: [{ id: 'edge-case', passed: false, actual: null, error: 'IndexError: x' }],
          }
        : base(arg),
    );
    const user = userEvent.setup();
    await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');
    expect(submitEvaluation.mock.calls[0][1].edgeCaseCheck).toEqual({
      originalOutput: null,
      referenceOutput: -3,
      error: 'IndexError: x',
    });
  });

  it('reports an infinite loop in the fix as timeout results, not a frozen page', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockImplementation(async (arg) =>
      arg.code === FIXED_CODE
        ? {
            timedOut: true,
            results: arg.tests.map((t) => ({
              id: t.id,
              passed: false,
              actual: null,
              error: 'timeout',
            })),
          }
        : base(arg),
    );
    const user = userEvent.setup();
    await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');
    expect(submitEvaluation.mock.calls[0][1].testResults).toEqual(
      attemptCreated.tests.map((t) => ({
        id: t.id,
        passed: false,
        actual: null,
        error: 'timeout',
      })),
    );
  });

  /** Runner whose first run of the student's fix fails while the worker restarts. */
  function makeRestartingRunner(onRestart) {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    let restarted = false;
    runner.run.mockImplementation(async (arg) => {
      if (arg.code === FIXED_CODE && !restarted) {
        restarted = true;
        onRestart();
        throw new Error('worker restarting');
      }
      return base(arg);
    });
    return runner;
  }

  it('waits for the restarted runner after a run fails mid-restart, then retries that run', async () => {
    let setRunner;
    const runner = makeRestartingRunner(() => act(() => setRunner({ ...runner, ready: false })));
    const user = userEvent.setup();
    ({ setRunner } = await renderReady({ runner }));
    await fillAnswer(user);
    await user.click(submitButton());

    await waitFor(() => expect(runner.run).toHaveBeenCalledTimes(3));
    await new Promise((resolve) => setTimeout(resolve, 150));
    expect(runner.run).toHaveBeenCalledTimes(3);
    expect(submitEvaluation).not.toHaveBeenCalled();

    act(() => setRunner({ ...runner, ready: true }));
    await screen.findByTestId('result-state');
    expect(runner.run).toHaveBeenCalledTimes(4);
    expect(submitEvaluation.mock.calls[0][1].edgeCaseCheck).toEqual({
      originalOutput: 0,
      referenceOutput: -3,
      error: null,
    });
  });

  it('gives up waiting when the restarted runner reports loadError', async () => {
    let setRunner;
    const runner = makeRestartingRunner(() =>
      act(() => setRunner({ ...runner, ready: false, loadError: 'Pyodide did not load.' })),
    );
    const user = userEvent.setup();
    ({ setRunner } = await renderReady({ runner }));
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The tests did not run');
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it('does not send an evaluation when the run rejects, and lets the student run again', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockRejectedValueOnce(new Error('The runner crashed.'));
    const user = userEvent.setup();
    await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The tests did not run, so the result was not sent.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(submitEvaluation).not.toHaveBeenCalled();

    runner.run.mockImplementation(base);
    await user.click(within(alert).getByRole('button', { name: 'Run the tests again' }));
    await screen.findByTestId('result-state');
    expect(createAttempt).toHaveBeenCalledTimes(1);
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('does not send results with a missing test', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockImplementation(async (arg) => {
      const out = await base(arg);
      return arg.code === FIXED_CODE ? { ...out, results: out.results.slice(1) } : out;
    });
    const user = userEvent.setup();
    await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('The test results are incomplete');
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it('locks the answer after the attempt is created', async () => {
    submitEvaluation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(
      await screen.findByText(/waiting for the AI-assisted assessment/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByLabelText('Explain the bug')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Request hint 1/ })).toBeDisabled();
    expect(screen.getByText('(stopped)')).toBeInTheDocument();
  });

  it('shows a server validation error from createAttempt without the maybe-saved text', async () => {
    createAttempt.mockRejectedValueOnce(
      new ApiError('Invalid input.', { status: 400, code: 'VALIDATION_ERROR' }),
    );
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid input.');
    expect(alert).not.toHaveTextContent('may');
    expect(submitButton()).toBeEnabled();
  });
});
