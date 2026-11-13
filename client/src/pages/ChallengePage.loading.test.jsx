import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ApiError, createAttempt, getChallenge } from '../api/client.js';
import { findMaxPublic } from '../api/mocks/fixtures.js';
import {
  fillAnswer,
  registerChallengePageMocks,
  renderPage,
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

describe('ChallengePage loading', () => {
  it('renders the h1 and a loading status while the challenge loads', () => {
    getChallenge.mockReturnValue(new Promise(() => {}));
    renderPage();
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1).toHaveTextContent('Challenge find-max');
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent('Loading challenge…');
    expect(getChallenge).toHaveBeenCalledWith('find-max', expect.anything());
  });

  it('shows "This challenge does not exist." for a 404, with the h1 and a link back', async () => {
    getChallenge.mockRejectedValue(
      new ApiError('Challenge not found.', { status: 404, code: 'NOT_FOUND' }),
    );
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('This challenge does not exist.');
    expect(within(alert).getByRole('link', { name: 'Back to problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('shows an error with a retry that loads the challenge', async () => {
    getChallenge
      .mockRejectedValueOnce(
        new ApiError('The server is not available right now.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(structuredClone(findMaxPublic));
    const user = userEvent.setup();
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The server is not available right now.');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Challenge find-max');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(
      await screen.findByRole('heading', { level: 1, name: findMaxPublic.title }),
    ).toBeInTheDocument();
  });

  it('shows the description, the code and the page title once loaded', async () => {
    await renderReady();
    expect(screen.getByText(findMaxPublic.description)).toBeInTheDocument();
    expect(screen.getByLabelText('Code editor')).toHaveValue(findMaxPublic.code);
    expect(document.title).toBe(`${findMaxPublic.title} · BugHunter Arena`);
    expect(screen.getByText('Time:')).toBeInTheDocument();
  });
});

describe('ChallengePage answer', () => {
  it('selects and deselects lines', async () => {
    const user = userEvent.setup();
    await renderReady();
    const line2 = screen.getByRole('button', { name: 'Line 2' });
    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Flagged lines:').parentElement).toHaveTextContent(
      /Flagged lines:\s*2$/,
    );
    await user.click(screen.getByRole('button', { name: 'Line 4' }));
    expect(screen.getByText('Flagged lines:').parentElement).toHaveTextContent(
      /Flagged lines:\s*2\s*4$/,
    );
    await user.click(line2);
    expect(line2).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('Flagged lines:').parentElement).toHaveTextContent(
      /Flagged lines:\s*4$/,
    );
  });

  it('requires a selected line and focuses its error', async () => {
    const user = userEvent.setup();
    await renderReady();
    await user.click(submitButton());
    const error = screen.getByText('Flag at least one line with the bug.');
    await waitFor(() => expect(error.closest('p')).toHaveFocus());
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('validates the explanation length and focuses the field', async () => {
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user, { explanation: 'prekratko      ' });
    await user.click(submitButton());
    const field = screen.getByLabelText('Explain the bug');
    expect(field).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByText('The explanation needs at least 20 characters.')).toBeInTheDocument();
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
    expect(
      screen.getByText('The explanation can have at most 1000 characters.'),
    ).toBeInTheDocument();
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('rejects edge-case input that is not JSON', async () => {
    const user = userEvent.setup();
    await renderReady();
    await fillAnswer(user);
    const args = screen.getByLabelText(/Arguments for/);
    await user.clear(args);
    await user.click(args);
    await user.paste('list');
    await user.click(submitButton());
    await waitFor(() => expect(args).toHaveFocus());
    expect(args).toHaveAttribute('aria-invalid', 'true');
    expect(createAttempt).not.toHaveBeenCalled();
  });

  it('"Reset to original" restores the original code', async () => {
    const user = userEvent.setup();
    await renderReady();
    const editor = screen.getByLabelText('Code editor');
    await user.type(editor, '\n# x');
    await user.click(screen.getByRole('button', { name: 'Reset to original' }));
    expect(editor).toHaveValue(findMaxPublic.code);
  });
});
