import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAttempt, requestHint } from '../api/client.js';
import { hintLevel1, hintLevel2, hintLevel3 } from '../api/mocks/fixtures.js';
import {
  fillAnswer,
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

describe('ChallengePage hints', () => {
  it('requests levels 1 to 3 one at a time, keeps each and reports the count', async () => {
    requestHint
      .mockResolvedValueOnce(hintLevel1)
      .mockResolvedValueOnce(hintLevel2)
      .mockResolvedValueOnce(hintLevel3);
    const user = userEvent.setup();
    await renderReady();

    await user.click(screen.getByRole('button', { name: 'Request hint 1 (−5 points)' }));
    expect(await screen.findByText(hintLevel1.hint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request hint 2 (−5 points)' }));
    expect(await screen.findByText(hintLevel2.hint)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Request hint 3 (−10 points)' }));
    expect(await screen.findByText(hintLevel3.hint)).toBeInTheDocument();

    expect(screen.getByText(hintLevel1.hint)).toBeInTheDocument();
    // Regression: the focused button disappears, so focus moves to the text instead of the body.
    expect(screen.getByText('You have used every hint.')).toHaveFocus();
    expect(screen.queryByRole('button', { name: /Request hint/ })).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Line 2' }));
    await user.click(screen.getByLabelText('Explain the bug'));
    await user.paste('nula');
    await user.click(screen.getByRole('button', { name: /Request hint 1/ }));
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

    await user.click(screen.getByRole('button', { name: /Request hint 1/ }));
    expect(screen.getByRole('button', { name: 'Loading hint…' })).toBeDisabled();
    rejectHint(
      new ApiError('Previše zahtjeva. Sačekaj malo pa pokušaj ponovo.', {
        status: 429,
        code: 'RATE_LIMITED',
      }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');

    await user.click(screen.getByRole('button', { name: /Request hint 1/ }));
    expect(await screen.findByText(hintLevel1.hint)).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(requestHint.mock.calls.map(([, body]) => body.level)).toEqual([1, 1]);
  });
});
