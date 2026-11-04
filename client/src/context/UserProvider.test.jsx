import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useUser } from '../hooks/useUser.js';
import { USER_STORAGE_KEY } from './UserContext.js';
import UserProvider from './UserProvider.jsx';

const stored = { userId: '6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b', displayName: 'dion' };

function Probe() {
  const { user, setUser, clearUser } = useUser();
  return (
    <>
      <p>{user ? `${user.displayName}:${user.userId}` : 'nema korisnika'}</p>
      <button type="button" onClick={() => setUser({ userId: 'u-2', displayName: 'ana' })}>
        postavi
      </button>
      <button type="button" onClick={clearUser}>
        obriši
      </button>
    </>
  );
}

function renderProbe() {
  return render(
    <UserProvider>
      <Probe />
    </UserProvider>,
  );
}

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('UserProvider', () => {
  it('starts empty without a stored user', () => {
    renderProbe();
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
  });

  it('reads the stored user', () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(stored));
    renderProbe();
    expect(screen.getByText(`dion:${stored.userId}`)).toBeInTheDocument();
  });

  it('writes and clears the user', async () => {
    const user = userEvent.setup();
    renderProbe();
    await user.click(screen.getByRole('button', { name: 'postavi' }));
    expect(screen.getByText('ana:u-2')).toBeInTheDocument();
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY))).toEqual({
      userId: 'u-2',
      displayName: 'ana',
    });
    await user.click(screen.getByRole('button', { name: 'obriši' }));
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
  });

  it.each([['{not json'], ['"just a string"'], ['{"userId":1}']])(
    'drops a corrupt value %s',
    (raw) => {
      localStorage.setItem(USER_STORAGE_KEY, raw);
      renderProbe();
      expect(screen.getByText('nema korisnika')).toBeInTheDocument();
      expect(localStorage.getItem(USER_STORAGE_KEY)).toBeNull();
    },
  );

  it('works when storage throws', async () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const user = userEvent.setup();
    renderProbe();
    expect(screen.getByText('nema korisnika')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'postavi' }));
    expect(screen.getByText('ana:u-2')).toBeInTheDocument();
  });
});
