import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getLeaderboard, getMe } from '../api/client.js';
import * as f from '../api/mocks/fixtures.js';
import AuthProvider from '../context/AuthProvider.jsx';
import UserProvider from '../context/UserProvider.jsx';
import { writeSession } from '../lib/session.js';
import Leaderboard from './Leaderboard.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getLeaderboard: vi.fn(), getMe: vi.fn() };
});

const session = { ...f.authSession, expiresAt: Math.floor(Date.now() / 1000) + 3600 };

function renderPage() {
  return render(
    <UserProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={['/leaderboard']}>
          <Leaderboard />
        </MemoryRouter>
      </AuthProvider>
    </UserProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  getLeaderboard.mockReset().mockResolvedValue(f.leaderboard);
  getMe.mockReset().mockResolvedValue(f.me);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('Leaderboard', () => {
  it('one focusable h1, the title and a loading status', () => {
    getLeaderboard.mockReturnValue(new Promise(() => {}));
    renderPage();
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('Leaderboard');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent('Loading the leaderboard…');
    expect(document.title).toBe('Leaderboard · BugHunter Arena');
    expect(getLeaderboard).toHaveBeenCalledWith({ limit: 100 }, expect.anything());
  });

  it('a table row per hunter with position, profile link, rank, solved and XP', async () => {
    renderPage();
    const table = await screen.findByRole('table', { name: 'Hunters ranked by XP' });
    const rows = within(table).getAllByRole('row');
    expect(rows).toHaveLength(1 + 2);
    expect(rows[1]).toHaveTextContent('1');
    expect(within(rows[1]).getByRole('link', { name: 'segfault_sam' })).toHaveAttribute(
      'href',
      '/u/segfault_sam',
    );
    expect(rows[1]).toHaveTextContent('Exterminator');
    expect(rows[1]).toHaveTextContent('274 XP');
    expect(rows[2]).toHaveTextContent('null_pointer');
    expect(screen.getByText(/Guests are not ranked/)).toHaveTextContent(
      'Guests are not ranked. Create an account to get on the board.',
    );
    expect(screen.getByRole('link', { name: 'Create an account' })).toHaveAttribute(
      'href',
      '/signup',
    );
  });

  it("marks the logged-in account's row and says where it stands", async () => {
    writeSession({ ...session, user: f.accountUser });
    renderPage();
    const table = await screen.findByRole('table', { name: 'Hunters ranked by XP' });
    const own = within(table)
      .getAllByRole('row')
      .find((row) => row.getAttribute('aria-current') === 'true');
    expect(own).toHaveTextContent('null_pointer');
    expect(within(own).getByText('You')).toBeInTheDocument();
    expect(screen.getByText(/You are/)).toHaveTextContent('You are #2 of 2.');
  });

  it('an account that is not listed: not in the loaded top, or not ranked yet', async () => {
    writeSession({ ...session, user: f.accountUser });
    const others = { ...f.leaderboard, entries: f.leaderboard.entries.slice(0, 1) };
    getLeaderboard.mockResolvedValueOnce({ ...others, total: 120 });
    const { unmount } = renderPage();
    expect(await screen.findByText('You are not in the top 1.')).toBeInTheDocument();
    unmount();

    getLeaderboard.mockResolvedValueOnce({ ...others, total: 1 });
    renderPage();
    expect(await screen.findByText('Solve a challenge to get on the board.')).toBeInTheDocument();
  });

  it('an empty board links to the problems', async () => {
    getLeaderboard.mockResolvedValue({ entries: [], total: 0, updatedAt: f.leaderboard.updatedAt });
    renderPage();
    expect(await screen.findByText('No hunter has solved a challenge yet.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Be the first' })).toHaveAttribute('href', '/problems');
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
  });

  it('a failed load shows an alert, and Try again reloads', async () => {
    const user = userEvent.setup();
    getLeaderboard.mockRejectedValueOnce(new ApiError('down', { code: 'NETWORK_ERROR' }));
    renderPage();
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The leaderboard could not be loaded.');
    await user.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('table', { name: 'Hunters ranked by XP' })).toBeInTheDocument();
    expect(getLeaderboard).toHaveBeenCalledTimes(2);
  });

  it('a malformed response is an error, not a crash', async () => {
    getLeaderboard.mockResolvedValue({ nope: true });
    renderPage();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'The leaderboard could not be loaded.',
    );
  });

  it('with accounts switched off, handles are plain text and there is no standing line', async () => {
    vi.stubEnv('VITE_AUTH_ENABLED', 'false');
    renderPage();
    const table = await screen.findByRole('table', { name: 'Hunters ranked by XP' });
    expect(within(table).queryByRole('link')).not.toBeInTheDocument();
    expect(within(table).getByText('segfault_sam')).toBeInTheDocument();
    expect(screen.queryByText(/Guests are not ranked/)).not.toBeInTheDocument();
  });
});
