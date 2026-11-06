import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getMe, getProfile } from '../api/client.js';
import * as f from '../api/mocks/fixtures.js';
import AuthProvider from '../context/AuthProvider.jsx';
import UserProvider from '../context/UserProvider.jsx';
import { writeSession } from '../lib/session.js';
import Login from './Login.jsx';
import Profile from './Profile.jsx';
import ProfileRedirect from './ProfileRedirect.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, getProfile: vi.fn(), getMe: vi.fn() };
});

function renderAt(path) {
  return render(
    <UserProvider>
      <AuthProvider>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/u/:handle" element={<Profile />} />
            <Route path="/profile" element={<ProfileRedirect />} />
            <Route path="/login" element={<Login />} />
          </Routes>
        </MemoryRouter>
      </AuthProvider>
    </UserProvider>,
  );
}

beforeEach(() => {
  localStorage.clear();
  getProfile.mockReset().mockResolvedValue(f.profile);
  getMe.mockReset().mockResolvedValue(f.me);
});

afterEach(() => vi.restoreAllMocks());

describe('Profile', () => {
  it('shows one focusable h1 with the handle while loading', () => {
    getProfile.mockReturnValue(new Promise(() => {}));
    renderAt('/u/null_pointer');
    const h1s = screen.getAllByRole('heading', { level: 1 });
    expect(h1s).toHaveLength(1);
    expect(h1s[0]).toHaveTextContent('@null_pointer');
    expect(h1s[0]).toHaveAttribute('tabindex', '-1');
    expect(screen.getByRole('status')).toHaveTextContent('Loading profile…');
    expect(document.title).toBe('@null_pointer · BugHunter Arena');
  });

  it('renders the profile from the mock', async () => {
    renderAt('/u/null_pointer');
    expect(await screen.findByText('Hunter', { selector: 'span' })).toBeInTheDocument();
    expect(getProfile).toHaveBeenCalledWith('null_pointer', expect.anything());
    expect(screen.getByText(/Hunting since Mar 2026/)).toBeInTheDocument();
    expect(screen.getByText('NP')).toBeInTheDocument();

    const stats = screen.getByRole('region', { name: 'Stats' });
    expect(within(stats).getByText('Total XP').nextSibling).toHaveTextContent('169');
    expect(within(stats).getByText('Solved').nextSibling).toHaveTextContent('2/ 6');
    expect(within(stats).getByText('Attempted').nextSibling).toHaveTextContent('3');

    const recent = screen.getByRole('region', { name: 'Recent solves' });
    const link = within(recent).getByRole('link', { name: 'Largest number in a list' });
    expect(link).toHaveAttribute('href', '/challenges/find-max');
    expect(within(recent).getAllByRole('listitem')).toHaveLength(2);

    const languages = screen.getByRole('region', { name: 'Solved by language' });
    expect(within(languages).getByRole('progressbar', { name: 'Python' })).toHaveAttribute(
      'aria-valuetext',
      '2 solved',
    );

    const next = screen.getByRole('region', { name: 'Next rank' });
    expect(within(next).getByText('Exterminator')).toBeInTheDocument();
    expect(within(next).getByText('31 XP to go')).toBeInTheDocument();
    // 169 XP is 69% of the way from Hunter (100) to Exterminator (200).
    expect(within(next).getByRole('progressbar')).toHaveAttribute('aria-valuenow', '69');

    // Cut items from the mockup are not there.
    expect(screen.queryByText(/Global rank|First bloods|Duels|Streak|Badges|Edit profile/i)).toBe(
      null,
    );
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  });

  it('an empty profile shows empty states and the top-rank-free next rank', async () => {
    getProfile.mockResolvedValue(f.profileEmpty);
    renderAt('/u/fresh_hunter');
    expect(await screen.findByText('No solved challenges yet.')).toBeInTheDocument();
    expect(screen.getByText('Nothing solved yet.')).toBeInTheDocument();
    expect(screen.getByText('100 XP to go')).toBeInTheDocument();
  });

  it('the top rank says so', async () => {
    getProfile.mockResolvedValue({
      ...f.profile,
      totalXp: 350,
      rank: { name: 'Arena Legend', xp: 350, nextName: null, xpToNext: 0 },
    });
    renderAt('/u/null_pointer');
    expect(await screen.findByText('Top rank reached')).toBeInTheDocument();
  });

  it('an unknown handle shows the 404 state', async () => {
    getProfile.mockRejectedValue(
      new ApiError('Hunter not found.', { status: 404, code: 'NOT_FOUND' }),
    );
    renderAt('/u/nobody_here');
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Hunter not found' });
    expect(h1).toHaveAttribute('tabindex', '-1');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Back to problems' })).toHaveAttribute(
      'href',
      '/problems',
    );
  });

  it('an invalid handle is not found without a request', () => {
    renderAt('/u/no%20way');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Hunter not found');
    expect(getProfile).not.toHaveBeenCalled();
  });

  it('a failed load offers a retry', async () => {
    getProfile
      .mockRejectedValueOnce(new ApiError('down', { status: null, code: 'NETWORK_ERROR' }))
      .mockResolvedValueOnce(f.profile);
    const user = userEvent.setup();
    renderAt('/u/null_pointer');
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('region', { name: 'Stats' })).toBeInTheDocument();
    expect(getProfile).toHaveBeenCalledTimes(2);
  });

  it('/profile goes to the login page without a session', () => {
    renderAt('/profile');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Log in');
  });

  it('/profile goes to your own profile with a session', async () => {
    writeSession({
      ...f.authSession,
      expiresAt: Math.floor(Date.now() / 1000) + 3600,
      user: f.accountUser,
    });
    renderAt('/profile');
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('@null_pointer');
    expect(await screen.findByRole('link', { name: 'Keep hunting' })).toBeInTheDocument();
  });
});
