import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, getMe, login, logout, signup } from '../api/client.js';
import * as f from '../api/mocks/fixtures.js';
import { useAuth } from '../hooks/useAuth.js';
import { useUser } from '../hooks/useUser.js';
import { clearSession, readSession, writeSession } from '../lib/session.js';
import AuthProvider from './AuthProvider.jsx';
import { USER_STORAGE_KEY } from './UserContext.js';
import UserProvider from './UserProvider.jsx';

vi.mock('../api/client.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    getMe: vi.fn(),
  };
});

const guest = { userId: f.userCreated.id, displayName: 'guest' };
const session = { ...f.authSession, expiresAt: Math.floor(Date.now() / 1000) + 3600 };

function wrapper({ children }) {
  return (
    <UserProvider>
      <AuthProvider>{children}</AuthProvider>
    </UserProvider>
  );
}

function renderAuth() {
  return renderHook(() => ({ auth: useAuth(), user: useUser() }), { wrapper });
}

beforeEach(() => {
  localStorage.clear();
  login.mockReset();
  signup.mockReset();
  logout.mockReset().mockResolvedValue(null);
  getMe.mockReset().mockResolvedValue(f.me);
});

afterEach(() => vi.restoreAllMocks());

describe('AuthProvider', () => {
  it('starts as a guest without a session and does not call /api/me', () => {
    const { result } = renderAuth();
    expect(result.current.auth.account).toBeNull();
    expect(result.current.auth.sessionExpired).toBe(false);
    expect(getMe).not.toHaveBeenCalled();
  });

  it('login stores the session and sets the user to the account id and handle', async () => {
    login.mockResolvedValue({ session, user: f.accountUser });
    const { result } = renderAuth();
    let account;
    await act(async () => {
      account = await result.current.auth.login(f.loginRequest);
    });
    expect(login).toHaveBeenCalledWith(f.loginRequest, { signal: undefined });
    expect(account).toEqual(f.accountUser);
    expect(result.current.auth.account).toEqual(f.accountUser);
    expect(result.current.user.user).toEqual({
      userId: f.accountUser.id,
      displayName: f.accountUser.handle,
    });
    expect(readSession()).toMatchObject({ accessToken: session.accessToken, user: f.accountUser });
    expect(JSON.parse(localStorage.getItem(USER_STORAGE_KEY)).userId).toBe(f.accountUser.id);
  });

  it('login errors propagate and leave the guest alone', async () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(guest));
    login.mockRejectedValue(
      new ApiError('Invalid email or password.', { status: 401, code: 'INVALID_CREDENTIALS' }),
    );
    const { result } = renderAuth();
    await act(async () => {
      await expect(result.current.auth.login(f.loginRequest)).rejects.toMatchObject({
        code: 'INVALID_CREDENTIALS',
      });
    });
    expect(result.current.auth.account).toBeNull();
    expect(result.current.user.user).toEqual(guest);
  });

  it('a malformed auth response is a BAD_RESPONSE and stores nothing', async () => {
    login.mockResolvedValue({ session: {}, user: f.accountUser });
    const { result } = renderAuth();
    await act(async () => {
      await expect(result.current.auth.login(f.loginRequest)).rejects.toMatchObject({
        code: 'BAD_RESPONSE',
      });
    });
    expect(readSession()).toBeNull();
  });

  it('signup sends the guest id as claimUserId', async () => {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(guest));
    signup.mockResolvedValue({ session, user: f.accountUser });
    const { result } = renderAuth();
    await act(async () => {
      await result.current.auth.signup(f.signupRequest);
    });
    expect(signup).toHaveBeenCalledWith(
      { ...f.signupRequest, claimUserId: guest.userId },
      { signal: undefined },
    );
    expect(result.current.user.user.userId).toBe(f.accountUser.id);
  });

  it('logout clears session and user and revokes the token', async () => {
    writeSession({ ...session, user: f.accountUser });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user.user?.userId).toBe(f.accountUser.id));
    act(() => result.current.auth.logout());
    expect(result.current.auth.account).toBeNull();
    expect(result.current.user.user).toBeNull();
    expect(readSession()).toBeNull();
    expect(logout).toHaveBeenCalledWith(session.accessToken);
  });

  it('an expired session (401 in the API client) clears the user and flags it', async () => {
    writeSession({ ...session, user: f.accountUser });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user.user).not.toBeNull());
    act(() => clearSession('expired'));
    expect(result.current.auth.account).toBeNull();
    expect(result.current.auth.sessionExpired).toBe(true);
    expect(result.current.user.user).toBeNull();
    act(() => result.current.auth.dismissExpired());
    expect(result.current.auth.sessionExpired).toBe(false);
  });

  it('repairs a missing user from the stored session on start and checks it with /api/me', async () => {
    writeSession({ ...session, user: f.accountUser });
    const { result } = renderAuth();
    await waitFor(() =>
      expect(result.current.user.user).toEqual({
        userId: f.accountUser.id,
        displayName: f.accountUser.handle,
      }),
    );
    expect(getMe).toHaveBeenCalledTimes(1);
    expect(result.current.auth.account).toEqual(f.accountUser);
  });

  it('switching the user to a guest ends the session but keeps the guest', async () => {
    writeSession({ ...session, user: f.accountUser });
    const { result } = renderAuth();
    await waitFor(() => expect(result.current.user.user?.userId).toBe(f.accountUser.id));
    act(() => result.current.user.setUser(guest));
    await waitFor(() => expect(result.current.auth.account).toBeNull());
    expect(readSession()).toBeNull();
    expect(result.current.user.user).toEqual(guest);
    expect(result.current.auth.sessionExpired).toBe(false);
  });
});
