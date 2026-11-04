import { useCallback, useMemo, useRef, useState } from 'react';
import { createUser } from '../api/client.js';
import { USER_STORAGE_KEY, UserContext } from './UserContext.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidUser(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.userId === 'string' &&
    UUID.test(value.userId) &&
    typeof value.displayName === 'string'
  );
}

/** Removes the stored user. Returns false when storage is unavailable. */
function removeStoredUser() {
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

/** Writes the user. Returns false when storage is unavailable. */
function writeStoredUser(user) {
  try {
    localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    return true;
  } catch {
    return false;
  }
}

/**
 * Reads { userId, displayName } from localStorage. Invalid data (bad JSON, wrong shape, userId not
 * a UUID) is removed. persisted is false when storage throws.
 */
function readStoredState() {
  let raw;
  try {
    raw = localStorage.getItem(USER_STORAGE_KEY);
  } catch {
    return { user: null, persisted: false };
  }
  if (raw === null) return { user: null, persisted: true };
  try {
    const parsed = JSON.parse(raw);
    if (isValidUser(parsed)) {
      return { user: { userId: parsed.userId, displayName: parsed.displayName }, persisted: true };
    }
  } catch {
    // Corrupt JSON: fall through and drop it.
  }
  return { user: null, persisted: removeStoredUser() };
}

/**
 * Provides { user, persisted, setUser, clearUser, ensureUser }.
 * - setUser({ userId, displayName }) stores the user and returns whether it was saved.
 * - ensureUser(displayName) returns the current user, or creates one with POST /api/users.
 *   ApiError from the server propagates to the caller.
 * - persisted is false when localStorage is unavailable: the user lasts only this page session.
 */
export default function UserProvider({ children }) {
  const [state, setState] = useState(readStoredState);
  // Mirrors state.user for ensureUser, so ensureUser keeps a stable identity.
  const userRef = useRef(state.user);
  const pendingRef = useRef(null);

  const setUser = useCallback((next) => {
    const user = { userId: next.userId, displayName: next.displayName };
    const persisted = writeStoredUser(user);
    userRef.current = user;
    setState({ user, persisted });
    return persisted;
  }, []);

  const clearUser = useCallback(() => {
    const persisted = removeStoredUser();
    userRef.current = null;
    setState({ user: null, persisted });
  }, []);

  const ensureUser = useCallback(
    (displayName, { signal } = {}) => {
      if (userRef.current) return Promise.resolve(userRef.current);
      // Two calls at once share one POST /api/users.
      if (!pendingRef.current) {
        pendingRef.current = createUser(displayName, { signal })
          .then((created) => {
            const user = { userId: created.id, displayName: created.displayName };
            setUser(user);
            return user;
          })
          .finally(() => {
            pendingRef.current = null;
          });
      }
      return pendingRef.current;
    },
    [setUser],
  );

  const value = useMemo(
    () => ({ user: state.user, persisted: state.persisted, setUser, clearUser, ensureUser }),
    [state, setUser, clearUser, ensureUser],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
