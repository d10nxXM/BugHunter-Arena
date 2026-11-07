import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { createAttempt } from '../api/client.js';
import { findMaxPublic } from '../api/mocks/fixtures.js';
import {
  fillAnswer,
  makeRunner,
  registerChallengePageMocks,
  renderReady,
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

describe('ChallengePage visible tests', () => {
  it('disables running and submitting while the runner is not ready, and shows loadError', async () => {
    const runner = makeRunner({ ready: false, loadError: 'Pyodide did not load.' });
    const user = userEvent.setup();
    await renderReady({ runner });
    expect(screen.getByText('Pyodide did not load.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Run visible tests' })).toBeDisabled();
    await fillAnswer(user);
    expect(submitButton()).toBeDisabled();
    expect(runner.run).not.toHaveBeenCalled();
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('shows a loading note while the runner starts', async () => {
    await renderReady({ runner: makeRunner({ ready: false }) });
    expect(screen.getByText('Loading the test runner…')).toBeInTheDocument();
  });

  it('runs only the visible tests on the current code and shows the summary', async () => {
    const user = userEvent.setup();
    const { runner } = await renderReady();
    await user.click(screen.getByRole('button', { name: 'Run visible tests' }));
    expect(await screen.findByText('2 of 2 visible tests passed.')).toBeInTheDocument();
    expect(runner.run).toHaveBeenCalledWith({
      code: findMaxPublic.code,
      functionName: 'find_max',
      tests: findMaxPublic.visibleTests,
    });
    expect(screen.getAllByText('Passed')).toHaveLength(2);
  });

  it('shows a timed-out run as interrupted', async () => {
    const run = vi.fn(async ({ tests }) => ({
      timedOut: true,
      results: tests.map((t) => ({ id: t.id, passed: false, actual: null, error: 'timeout' })),
    }));
    const user = userEvent.setup();
    await renderReady({ runner: makeRunner({ run }) });
    await user.click(screen.getByRole('button', { name: 'Run visible tests' }));
    expect(await screen.findByText('0 of 2 visible tests passed.')).toBeInTheDocument();
    expect(screen.getAllByText('Timed out (3 s)')).toHaveLength(2);
    expect(screen.getByText(/endless loop/)).toBeInTheDocument();
  });

  it('shows a resolved RuntimeError run as failed test results, not a runner error', async () => {
    const run = vi.fn(async ({ tests }) => ({
      timedOut: false,
      results: tests.map((t) => ({
        id: t.id,
        passed: false,
        actual: null,
        error: 'RuntimeError: <b>Pyodide crashed</b>',
      })),
    }));
    const user = userEvent.setup();
    await renderReady({ runner: makeRunner({ run }) });
    await user.click(screen.getByRole('button', { name: 'Run visible tests' }));
    expect(await screen.findByText('0 of 2 visible tests passed.')).toBeInTheDocument();
    expect(screen.queryByText(/The tests did not run/)).not.toBeInTheDocument();
    // Rendered as text, never as HTML.
    expect(screen.getAllByText(/RuntimeError: <b>Pyodide crashed<\/b>/)).toHaveLength(2);
    expect(document.querySelector('b')).toBeNull();
  });

  it('treats a rejected run as "did not run"', async () => {
    const run = vi.fn().mockRejectedValue(new Error('The runner crashed.'));
    const user = userEvent.setup();
    await renderReady({ runner: makeRunner({ run }) });
    await user.click(screen.getByRole('button', { name: 'Run visible tests' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The tests did not run. The test runner reported an error.',
    );
    expect(screen.queryByText(/visible tests passed/)).not.toBeInTheDocument();
  });
});
