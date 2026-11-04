import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ApiError,
  createAttempt,
  getAttempts,
  getChallenge,
  requestHint,
  submitEvaluation,
} from '../api/client.js';
import {
  attemptCreated,
  attemptsPage,
  evaluationAi,
  findMaxPublic,
  hintLevel1,
  hintLevel2,
  hintLevel3,
} from '../api/mocks/fixtures.js';
import { USER_STORAGE_KEY } from '../context/UserContext.js';
import UserProvider from '../context/UserProvider.jsx';
import { TestRunnerContext } from '../hooks/useTestRunner.js';
import ChallengePage from './ChallengePage.jsx';

vi.mock('../api/client.js', async (importOriginal) => ({
  ...(await importOriginal()),
  getChallenge: vi.fn(),
  requestHint: vi.fn(),
  createAttempt: vi.fn(),
  submitEvaluation: vi.fn(),
  getAttempts: vi.fn(),
}));

const USER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
const ATTEMPT_ID = attemptCreated.attemptId;
const EXPLANATION =
  'max_value počinje od 0, pa za listu samo negativnih brojeva funkcija vraća 0 koja nije u listi.';
const FIXED_CODE = 'def find_max(numbers):\n    return max(numbers) if numbers else None';

const timeoutError = () => new ApiError('Server ne odgovara. Pokušaj ponovo.', { code: 'TIMEOUT' });
const conflictError = () =>
  new ApiError('Pokušaj je već ocijenjen.', { status: 409, code: 'ALREADY_EVALUATED' });

/** Runner fake: the reference returns -3 for the edge case, the original 0, the fix passes. */
function makeRunner(overrides = {}) {
  const run = vi.fn(async ({ code, tests }) => ({
    timedOut: false,
    results: tests.map((t) => {
      if (t.id === 'edge-case') {
        const actual = code === attemptCreated.referenceSolution ? -3 : 0;
        return { id: t.id, passed: actual === t.expected, actual, error: null };
      }
      return { id: t.id, passed: true, actual: t.expected, error: null };
    }),
  }));
  return { ready: true, loadError: null, run, ...overrides };
}

function ResultProbe() {
  const location = useLocation();
  return <pre data-testid="result-state">{JSON.stringify(location.state)}</pre>;
}

function renderPage({ runner = makeRunner(), withUser = true } = {}) {
  if (withUser) {
    localStorage.setItem(
      USER_STORAGE_KEY,
      JSON.stringify({ userId: USER_ID, displayName: 'dion' }),
    );
  }
  const tree = (value) => (
    <UserProvider>
      <TestRunnerContext.Provider value={value}>
        <MemoryRouter initialEntries={['/challenges/find-max']}>
          <Routes>
            <Route path="/challenges/:id" element={<ChallengePage />} />
            <Route path="/challenges/:id/result" element={<ResultProbe />} />
          </Routes>
        </MemoryRouter>
      </TestRunnerContext.Provider>
    </UserProvider>
  );
  const utils = render(tree(runner));
  /** Re-renders with a new runner context value (for ready / loadError changes). */
  const setRunner = (value) => utils.rerender(tree(value));
  return { ...utils, runner, setRunner };
}

async function renderReady(options) {
  const result = renderPage(options);
  await screen.findByRole('heading', { level: 1, name: findMaxPublic.title });
  return result;
}

/** Selects line 2, writes the explanation and edge case, and replaces the code with a fix. */
async function fillAnswer(user, { explanation = EXPLANATION } = {}) {
  await user.click(screen.getByRole('button', { name: 'Linija 2' }));
  await user.click(screen.getByLabelText('Objašnjenje greške'));
  await user.paste(explanation);
  await user.click(screen.getByLabelText(/Argumenti poziva/));
  await user.paste('[-8, -3, -10]');
  await user.click(screen.getByLabelText('Očekivani rezultat'));
  await user.paste('-3');
  const editor = screen.getByLabelText('Editor koda');
  await user.clear(editor);
  await user.click(editor);
  await user.paste(FIXED_CODE);
}

const submitButton = () => screen.getByRole('button', { name: 'Predaj odgovor' });

function resultState() {
  return JSON.parse(screen.getByTestId('result-state').textContent);
}

function attemptItem(overrides = {}) {
  return { ...attemptsPage[0], id: ATTEMPT_ID, ...overrides };
}

beforeEach(() => {
  localStorage.clear();
  vi.mocked(getChallenge).mockReset().mockResolvedValue(structuredClone(findMaxPublic));
  vi.mocked(requestHint).mockReset();
  vi.mocked(createAttempt).mockReset().mockResolvedValue(structuredClone(attemptCreated));
  vi.mocked(submitEvaluation).mockReset().mockResolvedValue(structuredClone(evaluationAi));
  vi.mocked(getAttempts).mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('ChallengePage loading', () => {
  it('renders the h1 and a loading status while the challenge loads', () => {
    getChallenge.mockReturnValue(new Promise(() => {}));
    renderPage();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Izazov find-max');
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent('Učitavanje izazova…');
    expect(getChallenge).toHaveBeenCalledWith('find-max', expect.anything());
  });

  it('shows "Izazov ne postoji." for a 404, with the h1 and a link back', async () => {
    getChallenge.mockRejectedValue(
      new ApiError('Izazov ne postoji.', { status: 404, code: 'NOT_FOUND' }),
    );
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Izazov ne postoji.');
    expect(within(alert).getByRole('link', { name: 'Nazad na izazove' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows an error with a retry that loads the challenge', async () => {
    getChallenge
      .mockRejectedValueOnce(
        new ApiError('Server trenutno nije dostupan.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(structuredClone(findMaxPublic));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server trenutno nije dostupan.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Izazov find-max');
    await user.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: findMaxPublic.title }),
    ).toBeInTheDocument();
  });

  it('shows the description, the code and the page title once loaded', async () => {
    await renderReady();
    expect(screen.getByText(findMaxPublic.description)).toBeInTheDocument();
    expect(screen.getByLabelText('Editor koda')).toHaveValue(findMaxPublic.code);
    expect(document.title).toBe(`${findMaxPublic.title} · BugHunter Arena`);
    expect(screen.getByText('Vrijeme:')).toBeInTheDocument();
  });
});

describe('ChallengePage answer', () => {
  it('selects and deselects lines', async () => {
    const user = userEvent.setup();
    await renderReady();
    const line2 = screen.getByRole('button', { name: 'Linija 2' });
    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Označene linije: 2')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Linija 4' }));
    expect(screen.getByText('Označene linije: 2, 4')).toBeInTheDocument();
    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Označene linije: 4')).toBeInTheDocument();
  });

  it('requires a selected line and focuses its error', async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(submitButton());
    const error = screen.getByText('Označi bar jednu liniju sa greškom.');
    await waitFor(() => expect(error.closest('p')).toHaveFocus());
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('validates the explanation length and focuses the field', async () => {
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user, { explanation: 'prekratko      ' });
    await user.click(submitButton());
    const field = screen.getByLabelText('Objašnjenje greške');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('Objašnjenje mora imati najmanje 20 karaktera.')).toBeInTheDocument();
    await waitFor(() => expect(field).toHaveFocus());
    expect(createAttempt).not.toHaveBeenCalled();

    await user.type(field, 'jos teksta da bude dovoljno');
    expect(field).toHaveAttribute('aria-invalid', 'false');
  });

  it('rejects an explanation over 1000 characters', async () => {
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user, { explanation: 'a'.repeat(1001) });
    await user.click(submitButton());
    expect(screen.getByText('Objašnjenje može imati najviše 1000 karaktera.')).toBeInTheDocument();
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('rejects edge-case input that is not JSON', async () => {
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    const args = screen.getByLabelText(/Argumenti poziva/);
    await user.clear(args);
    await user.click(args);
    await user.paste('lista');
    await user.click(submitButton());
    await waitFor(() => expect(args).toHaveFocus());
    expect(args).toHaveAttribute('aria-invalid', 'true');
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('"Vrati original" restores the original code', async () => {
    const user = userEvent.setup();
    await renderReady();
    const editor = screen.getByLabelText('Editor koda');
    await user.type(editor, '\n# x');
    await user.click(screen.getByRole('button', { name: 'Vrati original' }));
    expect(editor).toHaveValue(findMaxPublic.code);
  });
});

describe('ChallengePage hints', () => {
  it('requests levels 1 to 3 one at a time, keeps each and reports the count', async () => {
    requestHint
      .mockResolvedValueOnce(hintLevel1)
      .mockResolvedValueOnce(hintLevel2)
      .mockResolvedValueOnce(hintLevel3);
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByRole('button', { name: 'Zatraži savjet 1 (−5 bodova)' }));
    expect(await screen.findByText(hintLevel1.hint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zatraži savjet 2 (−5 bodova)' }));
    expect(await screen.findByText(hintLevel2.hint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Zatraži savjet 3 (−10 bodova)' }));
    expect(await screen.findByText(hintLevel3.hint)).toBeInTheDocument();

    expect(screen.getByText(hintLevel1.hint)).toBeInTheDocument();
    expect(screen.getByText('Iskoristio si sve savjete.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Zatraži savjet/ })).not.toBeInTheDocument();
    expect(requestHint.mock.calls.map(([id, body]) => [id, body.level])).toEqual([
      ['find-max', 1],
      ['find-max', 2],
      ['find-max', 3],
    ]);

    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');
    expect(createAttempt.mock.calls[0][0].hintsUsed).toBe(3);
  });

  it('sends the current answer with the hint request', async () => {
    requestHint.mockResolvedValueOnce(hintLevel1);
    const user = userEvent.setup();
    await renderReady();
    await user.click(screen.getByRole('button', { name: 'Linija 2' }));
    await user.click(screen.getByLabelText('Objašnjenje greške'));
    await user.paste('nula');
    await user.click(screen.getByRole('button', { name: /Zatraži savjet 1/ }));
    await screen.findByText(hintLevel1.hint);
    expect(requestHint).toHaveBeenCalledWith(
      'find-max',
      { level: 1, currentAnswer: { selectedLines: [2], explanation: 'nula' } },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
  });

  it('shows a loading state, then the error, and retries the same level', async () => {
    let rejectHint;
    requestHint
      .mockReturnValueOnce(
        new Promise((_, reject) => {
          rejectHint = reject;
        }),
      )
      .mockResolvedValueOnce(hintLevel1);
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByRole('button', { name: /Zatraži savjet 1/ }));
    expect(screen.getByRole('button', { name: 'Učitavam savjet…' })).toBeDisabled();
    rejectHint(
      new ApiError('Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.', {
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Previše zahtjeva.');

    await user.click(screen.getByRole('button', { name: /Zatraži savjet 1/ }));
    expect(await screen.findByText(hintLevel1.hint)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requestHint.mock.calls.map(([, body]) => body.level)).toEqual([1, 1]);
  });
});

describe('ChallengePage visible tests', () => {
  it('disables running and submitting while the runner is not ready, and shows loadError', async () => {
    const runner = makeRunner({ ready: false, loadError: 'Pyodide se nije učitao.' });
    const user = userEvent.setup();
    await renderReady({ runner });
    expect(screen.getByText('Pyodide se nije učitao.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pokreni vidljive testove' })).toBeDisabled();
    await fillAnswer(user);
    expect(submitButton()).toBeDisabled();
    expect(runner.run).not.toHaveBeenCalled();
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('shows a loading note while the runner starts', async () => {
    await renderReady({ runner: makeRunner({ ready: false }) });
    expect(screen.getByText('Pokretač testova se učitava…')).toBeInTheDocument();
  });

  it('runs only the visible tests on the current code and shows the summary', async () => {
    const user = userEvent.setup();
    const { runner } = await renderReady();
    await user.click(screen.getByRole('button', { name: 'Pokreni vidljive testove' }));
    expect(await screen.findByText('2 od 2 vidljivih testova je prošlo.')).toBeInTheDocument();
    expect(runner.run).toHaveBeenCalledWith({
      code: findMaxPublic.code,
      functionName: 'find_max',
      tests: findMaxPublic.visibleTests,
    });
    expect(screen.getAllByText('Prošao')).toHaveLength(2);
  });

  it('shows a timed-out run as interrupted', async () => {
    const run = vi.fn(async ({ tests }) => ({
      timedOut: true,
      results: tests.map((t) => ({ id: t.id, passed: false, actual: null, error: 'timeout' })),
    }));
    const user = userEvent.setup();
    await renderReady({ runner: makeRunner({ run }) });
    await user.click(screen.getByRole('button', { name: 'Pokreni vidljive testove' }));
    expect(await screen.findByText('0 od 2 vidljivih testova je prošlo.')).toBeInTheDocument();
    expect(screen.getAllByText('Prekinut (3 s)')).toHaveLength(2);
    expect(screen.getByText(/beskonačnoj petlji/)).toBeInTheDocument();
  });

  it('treats a rejected run as "did not run"', async () => {
    const run = vi.fn().mockRejectedValue(new Error('Pokretač je pao.'));
    const user = userEvent.setup();
    await renderReady({ runner: makeRunner({ run }) });
    await user.click(screen.getByRole('button', { name: 'Pokreni vidljive testove' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Testovi nisu pokrenuti. Pokretač je pao.',
    );
    expect(screen.queryByText(/vidljivih testova je prošlo/)).not.toBeInTheDocument();
  });
});

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

  it('waits for the restarted runner after a timed-out edge-case run', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockImplementation(async (arg) =>
      arg.code === findMaxPublic.code
        ? {
            timedOut: true,
            results: [{ id: 'edge-case', passed: false, actual: null, error: 'timeout' }],
          }
        : base(arg),
    );
    const user = userEvent.setup();
    const { setRunner } = await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());

    await waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2));
    setRunner({ ...runner, ready: false });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(submitEvaluation).not.toHaveBeenCalled();

    setRunner({ ...runner, ready: true });
    await screen.findByTestId('result-state');
    expect(runner.run).toHaveBeenCalledTimes(3);
    expect(submitEvaluation.mock.calls[0][1].edgeCaseCheck).toEqual({
      originalOutput: null,
      referenceOutput: -3,
      error: 'timeout',
    });
  });

  it('gives up waiting when the restarted runner reports loadError', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockImplementation(async (arg) =>
      arg.code === findMaxPublic.code
        ? {
            timedOut: true,
            results: [{ id: 'edge-case', passed: false, actual: null, error: 'timeout' }],
          }
        : base(arg),
    );
    const user = userEvent.setup();
    const { setRunner } = await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());
    await waitFor(() => expect(runner.run).toHaveBeenCalledTimes(2));
    setRunner({ ...runner, ready: false, loadError: 'Pyodide se nije učitao.' });
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Testovi nisu pokrenuti');
    expect(alert).toHaveTextContent('Pyodide se nije učitao.');
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it('does not send an evaluation when the run rejects, and lets the student run again', async () => {
    const runner = makeRunner();
    const base = runner.run.getMockImplementation();
    runner.run.mockRejectedValueOnce(new Error('Pokretač je pao.'));
    const user = userEvent.setup();
    await renderReady({ runner });
    await fillAnswer(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Testovi nisu pokrenuti, pa rezultat nije poslat.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(submitEvaluation).not.toHaveBeenCalled();

    runner.run.mockImplementation(base);
    await user.click(within(alert).getByRole('button', { name: 'Pokreni testove ponovo' }));
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Rezultati testova nisu potpuni');
    expect(submitEvaluation).not.toHaveBeenCalled();
  });

  it('locks the answer after the attempt is created', async () => {
    submitEvaluation.mockReturnValue(new Promise(() => {}));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(
      await screen.findByText(/čekam pomoćnu AI procjenu/, {}, { timeout: 2000 }),
    ).toBeInTheDocument();
    expect(submitButton()).toBeDisabled();
    expect(screen.getByLabelText('Objašnjenje greške')).toBeDisabled();
    expect(screen.getByRole('button', { name: /Zatraži savjet 1/ })).toBeDisabled();
    expect(screen.getByText('(zaustavljeno)')).toBeInTheDocument();
  });

  it('shows a server validation error from createAttempt without the maybe-saved text', async () => {
    createAttempt.mockRejectedValueOnce(
      new ApiError('Neispravan unos.', { status: 400, code: 'VALIDATION_ERROR' }),
    );
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Neispravan unos.');
    expect(alert).not.toHaveTextContent('možda');
    expect(submitButton()).toBeEnabled();
  });
});

describe('ChallengePage timeouts and recovery', () => {
  it('createAttempt TIMEOUT: maybe-saved message, no auto-retry, manual retry submits again', async () => {
    createAttempt.mockRejectedValueOnce(timeoutError());
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Predaja možda nije stigla do servera. Pokušaj ponovo.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(createAttempt).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole('button', { name: 'Pošalji ponovo' }));
    await screen.findByTestId('result-state');
    expect(createAttempt).toHaveBeenCalledTimes(2);
  });

  it.each([
    ['NETWORK_ERROR', new ApiError('x', { code: 'NETWORK_ERROR' })],
    ['HTTP_ERROR', new ApiError('x', { status: 418, code: 'HTTP_ERROR' })],
    ['BAD_RESPONSE', new ApiError('x', { status: 201, code: 'BAD_RESPONSE' })],
    ['500', new ApiError('x', { status: 500, code: 'INTERNAL_ERROR' })],
  ])('createAttempt %s counts as maybe saved', async (_, error) => {
    createAttempt.mockRejectedValueOnce(error);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Predaja možda nije stigla');
  });

  it('createAttempt AbortError is not maybe saved', async () => {
    createAttempt.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Slanje je prekinuto. Pokušaj ponovo.');
    expect(alert).not.toHaveTextContent('možda');
    expect(within(alert).queryByRole('button')).not.toBeInTheDocument();
    expect(createAttempt).toHaveBeenCalledTimes(1);
  });

  it('evaluation TIMEOUT, attempt found evaluated: shows the score, no second POST', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    getAttempts.mockResolvedValueOnce([attemptItem({ score: 77 })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());

    const heading = await screen.findByRole('heading', { name: /Rezultat je sačuvan/ });
    await waitFor(() => expect(heading).toHaveFocus());
    const section = heading.closest('section');
    expect(section).toHaveTextContent('Bodovi: 77 od 100.');
    expect(section).toHaveTextContent('Testovi: 4 od 4 je prošlo.');
    expect(section).toHaveTextContent('Pomoćna AI procjena');
    expect(within(section).getByRole('link', { name: 'Pogledaj svoj napredak' })).toHaveAttribute(
      'href',
      '/progress',
    );
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
    expect(getAttempts).toHaveBeenCalledWith(
      {
        userId: USER_ID,
        challengeId: 'find-max',
        limit: 50,
        cursor: undefined,
        cursorId: undefined,
      },
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(screen.queryByTestId('result-state')).not.toBeInTheDocument();
  });

  it('evaluation TIMEOUT, attempt still submitted, re-POST 409, then found evaluated', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(conflictError());
    getAttempts
      .mockResolvedValueOnce([
        attemptItem({ status: 'submitted', score: null, breakdown: null, feedbackSource: null }),
      ])
      .mockResolvedValueOnce([attemptItem({ score: 64, feedbackSource: 'fallback' })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());

    const heading = await screen.findByRole('heading', { name: /Rezultat je sačuvan/ });
    expect(heading.closest('section')).toHaveTextContent('Bodovi: 64 od 100.');
    expect(heading.closest('section')).toHaveTextContent('Procjena bez AI-ja');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
    expect(submitEvaluation.mock.calls[1][1]).toEqual(submitEvaluation.mock.calls[0][1]);
    expect(getAttempts).toHaveBeenCalledTimes(2);
  });

  it('evaluation TIMEOUT, still submitted, re-POST succeeds: navigates to the result', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    getAttempts.mockResolvedValueOnce([attemptItem({ status: 'submitted', score: null })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    await screen.findByTestId('result-state');
    expect(resultState().evaluation).toEqual(evaluationAi);
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
  });

  it('re-POSTs at most once: still submitted after a 409 gives the maybe-saved message', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(conflictError());
    getAttempts.mockResolvedValue([attemptItem({ status: 'submitted', score: null })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Rezultat je možda sačuvan, ali ga nismo mogli učitati.');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
  });

  it('userId null: evaluation TIMEOUT gives the maybe-saved message and no GET', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    const user = userEvent.setup();
    await renderReady({ withUser: false });
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Rezultat je možda sačuvan, ali ga nismo mogli učitati.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(within(alert).queryByRole('link')).not.toBeInTheDocument();
    expect(getAttempts).not.toHaveBeenCalled();
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('409 on the first POST: recovers the stored result', async () => {
    submitEvaluation.mockRejectedValueOnce(conflictError());
    getAttempts.mockResolvedValueOnce([attemptItem({ score: 89 })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const heading = await screen.findByRole('heading', { name: /Rezultat je sačuvan/ });
    expect(heading.closest('section')).toHaveTextContent('Bodovi: 89 od 100.');
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('picks the item with the matching id across pages, not the newest', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    const firstPage = Array.from({ length: 50 }, (_, i) => ({
      ...attemptsPage[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
      score: 100,
      createdAt: `2026-11-04T10:00:${String(59 - i).padStart(2, '0')}.000000+00:00`,
    }));
    const last = firstPage[49];
    getAttempts
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([attemptItem({ score: 42 })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());

    const heading = await screen.findByRole('heading', { name: /Rezultat je sačuvan/ });
    expect(heading.closest('section')).toHaveTextContent('Bodovi: 42 od 100.');
    expect(getAttempts).toHaveBeenNthCalledWith(
      2,
      {
        userId: USER_ID,
        challengeId: 'find-max',
        limit: 50,
        cursor: last.createdAt,
        cursorId: last.id,
      },
      expect.anything(),
    );
  });

  it('attempt not in the list: maybe-saved message with the progress link', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    getAttempts.mockResolvedValueOnce([{ ...attemptsPage[0], id: 'someone-else' }]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Rezultat je možda sačuvan, ali ga nismo mogli učitati.');
    expect(within(alert).getByRole('link', { name: 'Pogledaj svoj napredak' })).toHaveAttribute(
      'href',
      '/progress',
    );
    expect(getAttempts).toHaveBeenCalledTimes(1);
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('GET failure during recovery: maybe-saved message', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    getAttempts.mockRejectedValueOnce(timeoutError());
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Rezultat je možda sačuvan');
  });

  it('evaluation AbortError is not maybe saved: no GET, a manual resend is offered', async () => {
    submitEvaluation.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Slanje je prekinuto. Pokušaj ponovo.');
    expect(getAttempts).not.toHaveBeenCalled();

    await user.click(within(alert).getByRole('button', { name: 'Pošalji rezultat ponovo' }));
    await screen.findByTestId('result-state');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
    expect(createAttempt).toHaveBeenCalledTimes(1);
  });

  it('evaluation 429 is shown, not recovered', async () => {
    submitEvaluation.mockRejectedValueOnce(
      new ApiError('Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.', {
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Previše zahtjeva.');
    expect(getAttempts).not.toHaveBeenCalled();
  });
});
