import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, createUser, getAttempts, getChallenges, getProgress } from '../api/client.js';
import {
  attemptsPage,
  challengeList,
  progress,
  progressEmpty,
  userCreated,
} from '../api/mocks/fixtures.js';
import { USER_STORAGE_KEY } from '../context/UserContext.js';
import UserProvider from '../context/UserProvider.jsx';
import Dashboard from './Dashboard.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    createUser: vi.fn(),
    getProgress: vi.fn(),
    getAttempts: vi.fn(),
    getChallenges: vi.fn(),
  };
});

const USER = { userId: userCreated.id, displayName: 'dion' };

function storeUser(user = USER) {
  localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
}

function renderDashboard() {
  return render(
    <UserProvider>
      <MemoryRouter initialEntries={['/progress']}>
        <Dashboard />
      </MemoryRouter>
    </UserProvider>,
  );
}

/** count attempts, newest first, with distinct ids and createdAt values. */
function makeAttempts(count, start = 0) {
  return Array.from({ length: count }, (_, i) => {
    const n = start + i;
    return {
      ...attemptsPage[0],
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      createdAt: `2026-11-03T10:${String(59 - (n % 60)).padStart(2, '0')}:00.000000+00:00`,
      score: n === 0 ? null : 50,
      status: n === 0 ? 'submitted' : 'evaluated',
      feedbackSource: n === 0 ? null : 'fallback',
    };
  });
}

beforeEach(() => {
  localStorage.clear();
  getChallenges.mockResolvedValue(challengeList);
  getProgress.mockResolvedValue(progress);
  getAttempts.mockResolvedValue(attemptsPage);
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('Dashboard without a user', () => {
  it('renders the h1 and a labelled name form, and loads nothing', () => {
    renderDashboard();
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('heading', { level: 1, name: 'Moj napredak' })).toHaveAttribute(
      'tabindex',
      '-1',
    );
    expect(screen.getByLabelText('Ime za prikaz')).toBeInTheDocument();
    expect(getProgress).not.toHaveBeenCalled();
    expect(getAttempts).not.toHaveBeenCalled();
  });

  it('validates the name length in Montenegrin and focuses the field', async () => {
    const user = userEvent.setup();
    renderDashboard();
    const input = screen.getByLabelText('Ime za prikaz');

    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Unesi ime.');
    expect(input).toHaveFocus();
    expect(input).toHaveAttribute('aria-invalid', 'true');

    await user.type(input, ' a ');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ime mora imati najmanje 2 znaka.');

    await user.clear(input);
    await user.type(input, 'x'.repeat(33));
    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Ime može imati najviše 32 znaka.');
    expect(createUser).not.toHaveBeenCalled();
  });

  it('creates the user with the trimmed name, then shows progress and focuses it', async () => {
    createUser.mockResolvedValue(userCreated);
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText('Ime za prikaz'), '  dion  ');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));

    expect(await screen.findByRole('heading', { name: 'Korisnik' })).toHaveFocus();
    expect(createUser).toHaveBeenCalledWith('dion');
    expect(screen.getByText('dion')).toBeInTheDocument();
    expect(await screen.findByText('245')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(userCreated.id, expect.anything());
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual({
      userId: userCreated.id,
      displayName: 'dion',
    });
  });

  it('shows the ApiError message and keeps the form when creating fails', async () => {
    createUser.mockRejectedValue(
      new ApiError('Server trenutno nije dostupan.', { code: 'NETWORK_ERROR' }),
    );
    const user = userEvent.setup();
    renderDashboard();

    const input = screen.getByLabelText('Ime za prikaz');
    await user.type(input, 'dion');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Server trenutno nije dostupan.');
    expect(input).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Sačuvaj ime' })).toBeEnabled();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it('shows a generic message for an unexpected error', async () => {
    createUser.mockRejectedValue(new TypeError('boom'));
    const user = userEvent.setup();
    renderDashboard();

    await user.type(screen.getByLabelText('Ime za prikaz'), 'dion');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj ime' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Ime nije sačuvano. Pokušaj ponovo.',
    );
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});

describe('Dashboard with a user', () => {
  beforeEach(() => storeUser());

  it('shows totals, per-challenge results and weak categories', async () => {
    renderDashboard();

    expect(screen.getByRole('heading', { level: 1, name: 'Moj napredak' })).toBeInTheDocument();
    expect(screen.getByText('Učitavanje napretka…')).toBeInTheDocument();

    const totals = await screen.findByText('Ukupni bodovi');
    expect(totals.nextSibling).toHaveTextContent('245');
    expect(screen.getByText('Riješeni izazovi').nextSibling).toHaveTextContent('3');
    expect(screen.getByText('Pokušani izazovi').nextSibling).toHaveTextContent('4');
    expect(screen.getByText('Prosječno vrijeme rješavanja').nextSibling).toHaveTextContent(
      '3 min 32 s',
    );

    const perChallenge = screen.getByRole('table', {
      name: 'Najbolji rezultat i broj pokušaja po izazovu',
    });
    const row = within(perChallenge).getByRole('row', { name: /Najveći element liste/ });
    expect(row).toHaveTextContent('89 / 100');
    expect(row).toHaveTextContent('2');
    // No client-side "solved" label until the server sends perChallenge[].solved.
    expect(within(perChallenge).queryByRole('columnheader', { name: 'Status' })).toBeNull();
    expect(perChallenge).not.toHaveTextContent('Riješen');
    expect(screen.getByText('Napredak učitan.')).toHaveAttribute('role', 'status');

    expect(screen.getByText('Pogrešna inicijalizacija: 2 promašaja')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledWith(USER.userId, expect.anything());
  });

  it('shows the empty state for an unknown user (zeros)', async () => {
    getProgress.mockResolvedValue(progressEmpty);
    getAttempts.mockResolvedValue([]);
    renderDashboard();

    expect(await screen.findByText(/Još nemaš nijedan pokušaj/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Izaberi izazov' })).toHaveAttribute('href', '/');
    expect(await screen.findByText('Još nema pokušaja.')).toBeInTheDocument();
    expect(screen.queryByText('Ukupni bodovi')).not.toBeInTheDocument();
  });

  it('shows an error with retry for progress, and loads again on retry', async () => {
    getProgress
      .mockRejectedValueOnce(
        new ApiError('Server ne odgovara. Pokušaj ponovo.', { code: 'TIMEOUT' }),
      )
      .mockResolvedValueOnce(progress);
    const user = userEvent.setup();
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Server ne odgovara. Pokušaj ponovo.');
    await user.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Pregled' })).toHaveFocus();

    expect(await screen.findByText('Ukupni bodovi')).toBeInTheDocument();
    expect(getProgress).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows an error with retry for the history', async () => {
    getAttempts
      .mockRejectedValueOnce(
        new ApiError('Server trenutno nije dostupan.', { code: 'NETWORK_ERROR' }),
      )
      .mockResolvedValueOnce(attemptsPage);
    const user = userEvent.setup();
    renderDashboard();

    const alert = await screen.findByRole('alert');
    await user.click(within(alert).getByRole('button', { name: 'Pokušaj ponovo' }));
    expect(screen.getByRole('heading', { level: 2, name: 'Istorija pokušaja' })).toHaveFocus();

    const table = await screen.findByRole('table', { name: 'Pokušaji, od najnovijeg' });
    expect(within(table).getByText('89 / 100')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(2);
  });

  it('pages the history with "Učitaj još" using cursor and cursorId, and stops at the end', async () => {
    const first = makeAttempts(20);
    const second = makeAttempts(3, 20);
    getAttempts.mockResolvedValueOnce(first).mockResolvedValueOnce(second);
    const user = userEvent.setup();
    renderDashboard();

    const table = await screen.findByRole('table', { name: 'Pokušaji, od najnovijeg' });
    expect(within(table).getAllByRole('row')).toHaveLength(21);
    expect(within(table).getByText('Nije ocijenjen')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenNthCalledWith(
      1,
      { userId: USER.userId, limit: 20 },
      expect.anything(),
    );

    await user.click(screen.getByRole('button', { name: 'Učitaj još' }));

    const end = await screen.findByText('Nema više pokušaja.');
    expect(end).toHaveFocus();
    expect(within(table).getAllByRole('row')).toHaveLength(24);
    expect(getAttempts).toHaveBeenNthCalledWith(
      2,
      {
        userId: USER.userId,
        limit: 20,
        cursor: first[19].createdAt,
        cursorId: first[19].id,
      },
      expect.anything(),
    );
    expect(screen.queryByRole('button', { name: 'Učitaj još' })).not.toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(2);
  });

  it('shows no "Učitaj još" when the first page is short', async () => {
    renderDashboard();
    expect(await screen.findByText('Nema više pokušaja.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Učitaj još' })).not.toBeInTheDocument();
  });

  it('keeps loaded rows and offers retry when loading more fails', async () => {
    getAttempts
      .mockResolvedValueOnce(makeAttempts(20))
      .mockRejectedValueOnce(
        new ApiError('Server ne odgovara. Pokušaj ponovo.', { code: 'TIMEOUT' }),
      )
      .mockResolvedValueOnce([]);
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Učitaj još' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Server ne odgovara.');
    const table = screen.getByRole('table', { name: 'Pokušaji, od najnovijeg' });
    expect(within(table).getAllByRole('row')).toHaveLength(21);

    await user.click(screen.getByRole('button', { name: 'Pokušaj ponovo' }));
    expect(await screen.findByText('Nema više pokušaja.')).toBeInTheDocument();
    expect(getAttempts).toHaveBeenCalledTimes(3);
  });

  it('falls back to challenge ids when titles fail to load', async () => {
    getChallenges.mockRejectedValue(new ApiError('x', { code: 'NETWORK_ERROR' }));
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    renderDashboard();
    const table = await screen.findByRole('table', {
      name: 'Najbolji rezultat i broj pokušaja po izazovu',
    });
    expect(within(table).getByText('find-max')).toBeInTheDocument();
  });

  it('removes the name with clearUser and shows the form again', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Ukloni ime' }));
    const warning = screen.getByText(
      'Nakon uklanjanja imena nećeš moći vidjeti dosadašnji napredak.',
    );
    expect(warning).toHaveFocus();
    expect(localStorage.getItem(USER_STORAGE_KEY)).not.toBeNull();
    await user.click(screen.getByRole('button', { name: 'Da, ukloni ime' }));

    expect(screen.getByLabelText('Ime za prikaz')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Tvoje ime' })).toHaveFocus();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    expect(screen.queryByText('Ukupni bodovi')).not.toBeInTheDocument();
  });

  it('changes the name by creating a new user and reloads progress for it', async () => {
    const newId = '11111111-2222-4333-8444-555555555555';
    createUser.mockResolvedValue({ id: newId, displayName: 'novo' });
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Promijeni ime' }));
    const input = screen.getByLabelText('Ime za prikaz');
    expect(input).toHaveFocus();
    expect(input).toHaveValue('dion');
    await user.clear(input);
    await user.type(input, 'novo');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj novo ime' }));

    expect(await screen.findByRole('heading', { name: 'Korisnik' })).toHaveFocus();
    expect(screen.getByText('novo')).toBeInTheDocument();
    await waitFor(() => expect(getProgress).toHaveBeenLastCalledWith(newId, expect.anything()));
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(newId);
  });

  it('keeps the old user when changing the name fails, and cancel restores the view', async () => {
    createUser.mockRejectedValue(new ApiError('Neispravan unos.', { code: 'VALIDATION_ERROR' }));
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Promijeni ime' }));
    await user.type(screen.getByLabelText('Ime za prikaz'), '2');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj novo ime' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Neispravan unos.');
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(USER.userId);

    await user.click(screen.getByRole('button', { name: 'Odustani' }));
    expect(screen.getByRole('heading', { name: 'Korisnik' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Promijeni ime' })).toBeInTheDocument();
  });

  it('cancels removing the name and keeps the user', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Ukloni ime' }));
    await user.click(screen.getByRole('button', { name: 'Odustani' }));

    expect(screen.getByRole('heading', { name: 'Korisnik' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Ukloni ime' })).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(USER.userId);
  });

  it('closes the form without creating a user when the name is unchanged', async () => {
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Promijeni ime' }));
    const input = screen.getByLabelText('Ime za prikaz');
    await user.clear(input);
    await user.type(input, '  dion ');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj novo ime' }));

    expect(await screen.findByRole('heading', { name: 'Korisnik' })).toHaveFocus();
    expect(screen.getByRole('button', { name: 'Promijeni ime' })).toBeInTheDocument();
    expect(createUser).not.toHaveBeenCalled();
    expect(getProgress).toHaveBeenCalledTimes(1);
  });

  it('keeps "Odustani" inactive while a new name is being saved', async () => {
    let resolve;
    createUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Promijeni ime' }));
    await user.type(screen.getByLabelText('Ime za prikaz'), '2');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj novo ime' }));

    const cancel = screen.getByRole('button', { name: 'Odustani' });
    expect(cancel).toHaveAttribute('aria-disabled', 'true');
    await user.click(cancel);
    expect(screen.getByLabelText('Ime za prikaz')).toBeInTheDocument();

    resolve({ id: '11111111-2222-4333-8444-555555555555', displayName: 'dion2' });
    expect(await screen.findByText('dion2')).toBeInTheDocument();
  });

  it('shows an error state when progress is not an object', async () => {
    getProgress.mockResolvedValue('not json');
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Podaci nisu učitani. Pokušaj ponovo.');
    expect(screen.queryByText('Ukupni bodovi')).not.toBeInTheDocument();
  });

  it('shows the error state when progress lacks finite attempted, solved and totalScore', async () => {
    getProgress.mockResolvedValue({});
    renderDashboard();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Podaci nisu učitani. Pokušaj ponovo.');
    expect(within(alert).getByRole('button', { name: 'Pokušaj ponovo' })).toBeInTheDocument();
    expect(screen.queryByText('Ukupni bodovi')).not.toBeInTheDocument();
  });

  it('ignores a createUser result that arrives after unmount', async () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let resolve;
    createUser.mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const user = userEvent.setup();
    const { unmount } = renderDashboard();
    await screen.findByText('Ukupni bodovi');

    await user.click(screen.getByRole('button', { name: 'Promijeni ime' }));
    await user.type(screen.getByLabelText('Ime za prikaz'), '2');
    await user.click(screen.getByRole('button', { name: 'Sačuvaj novo ime' }));
    unmount();
    resolve({ id: '11111111-2222-4333-8444-555555555555', displayName: 'dion2' });
    await new Promise((r) => setTimeout(r, 0));

    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual(USER);
    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('announces a loaded page and keeps "Učitaj još" focusable while loading', async () => {
    let resolveSecond;
    getAttempts.mockResolvedValueOnce(makeAttempts(20)).mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolveSecond = r;
        }),
    );
    const user = userEvent.setup();
    renderDashboard();

    await user.click(await screen.findByRole('button', { name: 'Učitaj još' }));
    const busy = screen.getByRole('button', { name: 'Učitavanje…' });
    expect(busy).toHaveAttribute('aria-disabled', 'true');
    expect(busy).not.toBeDisabled();
    expect(busy).toHaveFocus();
    await user.click(busy);
    expect(getAttempts).toHaveBeenCalledTimes(2);

    resolveSecond(makeAttempts(20, 20));
    expect(await screen.findByText('Učitano još 20 pokušaja.')).toHaveAttribute('role', 'status');
    expect(screen.getByRole('button', { name: 'Učitaj još' })).toHaveFocus();
  });

  it('puts the challenge first in the history and labels each feedback source', async () => {
    getAttempts.mockResolvedValue([
      { ...attemptsPage[0], id: '00000000-0000-4000-8000-000000000001' },
      {
        ...attemptsPage[0],
        id: '00000000-0000-4000-8000-000000000002',
        feedbackSource: 'fallback',
      },
      { ...attemptsPage[0], id: '00000000-0000-4000-8000-000000000003', feedbackSource: 'demo' },
    ]);
    renderDashboard();

    const table = await screen.findByRole('table', { name: 'Pokušaji, od najnovijeg' });
    expect(within(table).getAllByRole('columnheader')[0]).toHaveTextContent('Izazov');
    const rows = within(table).getAllByRole('row').slice(1);
    expect(within(rows[0]).getByRole('rowheader')).toHaveTextContent('Najveći element liste');
    expect(rows[0]).toHaveTextContent('Pomoćna AI procjena');
    expect(rows[1]).toHaveTextContent('Procjena bez AI-ja');
    expect(rows[2]).toHaveTextContent('Pomoćna AI procjena (demo)');
  });
});
