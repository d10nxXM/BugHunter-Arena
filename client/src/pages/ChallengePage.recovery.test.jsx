import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAttempt, getAttempts, submitEvaluation } from '../api/client.js';
import { attemptsPage, evaluationAi } from '../api/mocks/fixtures.js';
import {
  USER_ID,
  attemptItem,
  conflictError,
  fillAnswer,
  registerChallengePageMocks,
  renderReady,
  resultState,
  submitButton,
  timeoutError,
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

describe('ChallengePage timeouts and recovery', () => {
  it('createAttempt TIMEOUT: maybe-saved message, no auto-retry, manual retry submits again', async () => {
    createAttempt.mockRejectedValueOnce(timeoutError());
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent(
      'Your answer may not have reached the server. Please try again.',
    );
    await waitFor(() => expect(alert).toHaveFocus());
    expect(createAttempt).toHaveBeenCalledTimes(1);

    await user.click(within(alert).getByRole('button', { name: 'Submit again' }));
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Your answer may not have reached');
  });

  it('createAttempt AbortError is not maybe saved', async () => {
    createAttempt.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sending was interrupted. Please try again.');
    expect(alert).not.toHaveTextContent('may');
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

    const heading = await screen.findByRole('heading', { name: /Your result is saved/ });
    await waitFor(() => expect(heading).toHaveFocus());
    const section = heading.closest('section');
    expect(section).toHaveTextContent('Score: 77 of 100.');
    expect(section).toHaveTextContent('Tests: 4 of 4 passed.');
    expect(section).toHaveTextContent('AI-assisted assessment');
    expect(within(section).getByRole('link', { name: 'See your progress' })).toHaveAttribute(
      'href',
      '/dashboard',
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

    const heading = await screen.findByRole('heading', { name: /Your result is saved/ });
    expect(heading.closest('section')).toHaveTextContent('Score: 64 of 100.');
    expect(heading.closest('section')).toHaveTextContent('Assessed without AI');
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

  it('re-POSTs at most once: still submitted after a 409 says the evaluation was not saved', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError()).mockRejectedValueOnce(conflictError());
    getAttempts.mockResolvedValue([attemptItem({ status: 'submitted', score: null })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The result was not saved on the server.');
    expect(alert).not.toHaveTextContent('may be saved');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
  });

  it('userId null: evaluation TIMEOUT gives the maybe-saved message and no GET', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    const user = userEvent.setup();
    await renderReady({ withUser: false });
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your result may be saved, but it could not be loaded.');
    await waitFor(() => expect(alert).toHaveFocus());
    expect(
      within(alert).queryByRole('link', { name: 'See your progress' }),
    ).not.toBeInTheDocument();
    expect(getAttempts).not.toHaveBeenCalled();
    expect(submitEvaluation).toHaveBeenCalledTimes(1);

    // An anonymous student cannot look the attempt up, so a manual retry POSTs directly.
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    await screen.findByTestId('result-state');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
    expect(getAttempts).not.toHaveBeenCalled();
  });

  it('409 on the first POST: recovers the stored result', async () => {
    submitEvaluation.mockRejectedValueOnce(conflictError());
    getAttempts.mockResolvedValueOnce([attemptItem({ score: 89 })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const heading = await screen.findByRole('heading', { name: /Your result is saved/ });
    expect(heading.closest('section')).toHaveTextContent('Score: 89 of 100.');
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

    const heading = await screen.findByRole('heading', { name: /Your result is saved/ });
    expect(heading.closest('section')).toHaveTextContent('Score: 42 of 100.');
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
    expect(alert).toHaveTextContent('Your result may be saved, but it could not be loaded.');
    expect(within(alert).getByRole('link', { name: 'See your progress' })).toHaveAttribute(
      'href',
      '/dashboard',
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Your result may be saved');
  });

  it('evaluation AbortError is not maybe saved: no GET, a manual resend is offered', async () => {
    submitEvaluation.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Sending was interrupted. Please try again.');
    expect(getAttempts).not.toHaveBeenCalled();

    // The manual retry checks GET /api/attempts first (docs/API.md), then re-POSTs once.
    getAttempts.mockResolvedValueOnce([attemptItem({ status: 'submitted', score: null })]);
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    await screen.findByTestId('result-state');
    expect(getAttempts).toHaveBeenCalledTimes(1);
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
    expect(createAttempt).toHaveBeenCalledTimes(1);
  });

  it('manual retry finds the stored result and does not POST again', async () => {
    submitEvaluation.mockRejectedValueOnce(new DOMException('aborted', 'AbortError'));
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    getAttempts.mockResolvedValueOnce([attemptItem({ score: 71 })]);
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    const heading = await screen.findByRole('heading', { name: /Your result is saved/ });
    expect(heading.closest('section')).toHaveTextContent('Score: 71 of 100.');
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('a failed re-POST is reported, not shown as maybe saved (400)', async () => {
    submitEvaluation
      .mockRejectedValueOnce(timeoutError())
      .mockRejectedValueOnce(
        new ApiError('Invalid input.', { status: 400, code: 'VALIDATION_ERROR' }),
      );
    getAttempts.mockResolvedValueOnce([attemptItem({ status: 'submitted', score: null })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Invalid input.');
    expect(alert).not.toHaveTextContent('may be saved');
    expect(within(alert).queryByRole('button', { name: 'Send the result again' })).toBeNull();
  });

  it('a manual retry after a re-POST never POSTs a third time', async () => {
    submitEvaluation.mockRejectedValue(timeoutError());
    getAttempts.mockResolvedValue([attemptItem({ status: 'submitted', score: null })]);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    // First POST times out, recovery finds it submitted, the single re-POST times out too.
    const alert = await screen.findByRole('alert');
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    expect(await screen.findByText(/The result was not saved/)).toBeInTheDocument();
    expect(submitEvaluation).toHaveBeenCalledTimes(2);
  });

  it('stops paging when the cursor does not advance', async () => {
    submitEvaluation.mockRejectedValueOnce(timeoutError());
    const samePage = Array.from({ length: 50 }, (_, i) => ({
      ...attemptsPage[0],
      id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    }));
    getAttempts.mockResolvedValue(samePage);
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    expect(await screen.findByRole('alert')).toHaveTextContent('Your result may be saved');
    expect(getAttempts).toHaveBeenCalledTimes(2);
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
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
    expect(await screen.findByRole('alert')).toHaveTextContent('Too many requests.');
    expect(getAttempts).not.toHaveBeenCalled();
  });

  it('429 twice then success: retries POST directly, no lookup, no maybe-saved message', async () => {
    const limited = () => new ApiError('Too many requests.', { status: 429, code: 'RATE_LIMITED' });
    submitEvaluation.mockRejectedValueOnce(limited()).mockRejectedValueOnce(limited());
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    await user.click(submitButton());
    let alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    await waitFor(() => expect(submitEvaluation).toHaveBeenCalledTimes(2));
    alert = await screen.findByRole('alert');
    expect(alert).not.toHaveTextContent('may be saved');
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    await screen.findByTestId('result-state');
    expect(submitEvaluation).toHaveBeenCalledTimes(3);
    expect(getAttempts).not.toHaveBeenCalled();
  });

  it('anonymous 409 on the evaluation POST: message with the list link, no retry button', async () => {
    submitEvaluation.mockRejectedValueOnce(conflictError());
    const user = userEvent.setup();
    await renderReady({ withUser: false });
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Your result may be saved');
    expect(within(alert).queryByRole('button', { name: 'Send the result again' })).toBeNull();
    expect(within(alert).getByRole('link')).toBeInTheDocument();
    expect(getAttempts).not.toHaveBeenCalled();
    expect(submitEvaluation).toHaveBeenCalledTimes(1);
  });

  it('anonymous: a second maybe-saved failure offers no further retry', async () => {
    submitEvaluation.mockRejectedValue(timeoutError());
    const user = userEvent.setup();
    await renderReady({ withUser: false });
    await fillAnswer(user);
    await user.click(submitButton());
    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Send the result again' }));
    await waitFor(() => expect(submitEvaluation).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Send the result again' })).toBeNull(),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Your result may be saved');
  });
});
