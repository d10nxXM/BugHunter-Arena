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
