import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ApiError,
  getMe,
  login as apiLogin,
  logout as apiLogout,
  signup as apiSignup,
} from '../api/client.js';
import { useUser } from '../hooks/useUser.js';
import {
  clearSession,
  isValidAccountUser,
  readSession,
  subscribeSession,
  writeSession,
} from '../lib/session.js';
import { AuthContext } from './AuthContext.js';

const MESSAGE_BAD_RESPONSE = 'Something went wrong talking to the server.';

/** Ends the session on this device and asks the server to revoke it (best effort). */
function endSession() {
  const token = readSession()?.accessToken;
  clearSession('logout');
  if (token) apiLogout(token).catch(() => {});
}

/**
 * Provides { account, sessionExpired, login, signup, logout, dismissExpired }. Must sit inside
 * UserProvider.
 * - account is the logged-in { id, handle, displayName, memberSince }, or null for a guest.
 * - login({ email, password }, { signal }) and signup({ handle, email, password }, { signal })
 *   store the session and call setUser({ userId: user.id, displayName: user.handle }), so the
 *   existing userId call sites send the account's id. They resolve with the account and reject
 *   with ApiError.
 * - logout() drops the session and the user; the server revoke is fire-and-forget.
 * - sessionExpired is true after the server rejected the session (401), until the next login or
 *   dismissExpired().
 * The bha.user entry follows the account: while a session exists, a different user (the
 * dashboard's "new name" or "remove name") ends the session.
 */
export default function AuthProvider({ children }) {
  const { user, setUser, clearUser } = useUser();
  const [state, setState] = useState(() => ({
    account: readSession()?.user ?? null,
    sessionExpired: false,
  }));
  const { account } = state;

  // Session changes from anywhere: login here, refresh or 401 in src/api/client.js.
  useEffect(
    () =>
      subscribeSession((session, reason) => {
        setState((prev) => ({
          account: session?.user ?? null,
          sessionExpired: session ? false : reason === 'expired' || prev.sessionExpired,
        }));
        // An expired account id is useless without its token; logout() clears the user itself,
        // and switching to a guest keeps the new guest.
        if (!session && reason === 'expired') clearUser();
      }),
    [clearUser],
  );

  // Keep bha.user on the account: repair it when it differs, end the session when the user
  // deliberately switched away from the account.
  const prevUserIdRef = useRef(null);
  useEffect(() => {
    const userId = user?.userId ?? null;
    const prev = prevUserIdRef.current;
    prevUserIdRef.current = userId;
    if (!account || userId === account.id) return;
    if (prev === account.id) {
      endSession();
      return;
    }
    setUser({ userId: account.id, displayName: account.handle });
  }, [user, account, setUser]);

  // Check a stored session once on start: a dead one is cleared by the API client (401).
  useEffect(() => {
    if (!readSession()) return undefined;
    const controller = new AbortController();
    getMe({ signal: controller.signal })
      .then((me) => {
        const current = readSession();
        if (current && isValidAccountUser(me) && me.id === current.user.id) {
          writeSession({ ...current, user: { ...current.user, ...me } }, 'me');
        }
      })
      .catch(() => {});
    return () => controller.abort();
  }, []);

  const applyAuth = useCallback(
    (data) => {
      const stored = writeSession({ ...data?.session, user: data?.user }, 'login');
      if (!stored) {
        throw new ApiError(MESSAGE_BAD_RESPONSE, { status: 200, code: 'BAD_RESPONSE' });
      }
      setUser({ userId: stored.user.id, displayName: stored.user.handle });
      return stored.user;
    },
    [setUser],
  );

  const login = useCallback(
    async (credentials, { signal } = {}) => applyAuth(await apiLogin(credentials, { signal })),
    [applyAuth],
  );

  const signup = useCallback(
    async ({ handle, email, password }, { signal } = {}) => {
      // A guest's id lets the server move the guest's attempts to the new account (P1 claim).
      const claimUserId = readSession() ? null : (user?.userId ?? null);
      return applyAuth(await apiSignup({ handle, email, password, claimUserId }, { signal }));
    },
    [applyAuth, user],
  );

  const logout = useCallback(() => {
    endSession();
    clearUser();
  }, [clearUser]);

  const dismissExpired = useCallback(() => {
    setState((prev) => (prev.sessionExpired ? { ...prev, sessionExpired: false } : prev));
  }, []);

  const value = useMemo(
    () => ({
      account,
      sessionExpired: state.sessionExpired,
      login,
      signup,
      logout,
      dismissExpired,
    }),
    [account, state.sessionExpired, login, signup, logout, dismissExpired],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
