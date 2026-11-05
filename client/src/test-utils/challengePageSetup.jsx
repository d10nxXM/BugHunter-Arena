/**
 * Shared setup for the ChallengePage.*.test.jsx files. Each test file must still declare the
 * two vi.mock() calls itself (vi.mock is hoisted per test file only):
 *
 *   vi.mock('../workers/monacoSetup.js', async () => ({
 *     monaco: (await import('../test-utils/fakeMonaco.js')).fakeMonaco,
 *   }));
 *   vi.mock('../api/client.js', async (importOriginal) => ({
 *     ...(await importOriginal()),
 *     getChallenge: vi.fn(), requestHint: vi.fn(), createAttempt: vi.fn(),
 *     submitEvaluation: vi.fn(), getAttempts: vi.fn(),
 *   }));
 *
 * and call registerChallengePageMocks() at the top level.
 */
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, vi } from 'vitest';
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
} from '../api/mocks/fixtures.js';
import { USER_STORAGE_KEY } from '../context/UserContext.js';
import UserProvider from '../context/UserProvider.jsx';
import { TestRunnerContext } from '../hooks/useTestRunner.js';
import ChallengePage from '../pages/ChallengePage.jsx';
import ResultProbe from './ResultProbe.jsx';

export const USER_ID = '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b';
export const ATTEMPT_ID = attemptCreated.attemptId;
export const EXPLANATION =
  'max_value počinje od 0, pa za listu samo negativnih brojeva funkcija vraća 0 koja nije u listi.';
export const FIXED_CODE = 'def find_max(numbers):\n    return max(numbers) if numbers else None';

export const timeoutError = () =>
  new ApiError('Server ne odgovara. Pokušaj ponovo.', { code: 'TIMEOUT' });
export const conflictError = () =>
  new ApiError('Pokušaj je već ocijenjen.', { status: 409, code: 'ALREADY_EVALUATED' });

/** Resets the mocked API (default: challenge loads, attempt and evaluation succeed) per test. */
export function registerChallengePageMocks() {
  beforeEach(() => {
    localStorage.clear();
    vi.mocked(getChallenge).mockReset().mockResolvedValue(structuredClone(findMaxPublic));
    vi.mocked(requestHint).mockReset();
    vi.mocked(createAttempt).mockReset().mockResolvedValue(structuredClone(attemptCreated));
    vi.mocked(submitEvaluation).mockReset().mockResolvedValue(structuredClone(evaluationAi));
    vi.mocked(getAttempts).mockReset();
  });
  afterEach(() => vi.restoreAllMocks());
}

/** Runner fake: the reference returns -3 for the edge case, the original 0, the fix passes. */
export function makeRunner(overrides = {}) {
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

export function renderPage({ runner = makeRunner(), withUser = true } = {}) {
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

export async function renderReady(options) {
  const result = renderPage(options);
  await screen.findByRole('heading', { level: 1, name: findMaxPublic.title });
  return result;
}

/** Selects line 2, writes the explanation and edge case, and replaces the code with a fix. */
export async function fillAnswer(user, { explanation = EXPLANATION } = {}) {
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

export const submitButton = () => screen.getByRole('button', { name: 'Predaj odgovor' });

export function resultState() {
  return JSON.parse(screen.getByTestId('result-state').textContent);
}

export function attemptItem(overrides = {}) {
  return { ...attemptsPage[0], id: ATTEMPT_ID, ...overrides };
}
