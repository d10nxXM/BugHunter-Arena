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

/** Message when the user was cleared while POST /api/users was in flight. */
export const USER_CHANGED_MESSAGE = 'Korisnik je u međuvremenu promijenjen. Pokušaj ponovo.';

function abortReason(signal) {
  return signal.reason ?? new DOMException('The operation was aborted.', 'AbortError');
}

/** Lets one caller stop waiting for a shared promise without cancelling it for the others. */
function withCallerAbort(shared, signal) {
  if (!signal) return shared;
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(abortReason(signal));
    signal.addEventListener('abort', onAbort, { once: true });
    shared.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

/**
 * Provides { user, persisted, setUser, clearUser, ensureUser }.
 * - setUser({ userId, displayName }) stores the user and returns whether it was saved.
 * - ensureUser(displayName, { signal }) returns the current user, or creates one with
 *   POST /api/users. Concurrent calls share one request, which only the API client's own timeout
 *   can cancel; a caller's signal only stops that caller waiting (it rejects with AbortError).
 *   ApiError from the server propagates to the caller. If setUser or clearUser runs while the
 *   request is in flight, the created user is not applied: the call resolves with the user set in
 *   the meantime, or rejects with Error(USER_CHANGED_MESSAGE) if the user was cleared.
 * - persisted is false when localStorage is unavailable: the user lasts only this page session.
 */
export default function UserProvider({ children }) {
  const [state, setState] = useState(readStoredState);
  // Mirrors state.user for ensureUser, so ensureUser keeps a stable identity.
  const userRef = useRef(state.user);
  const pendingRef = useRef(null);
  // Bumped by every setUser and clearUser, so a late createUser cannot overwrite them.
  const generationRef = useRef(0);

  const setUser = useCallback((next) => {
    const user = { userId: next.userId, displayName: next.displayName };
    const persisted = writeStoredUser(user);
    generationRef.current += 1;
    pendingRef.current = null;
    userRef.current = user;
    setState({ user, persisted });
    return persisted;
  }, []);

  const clearUser = useCallback(() => {
    const persisted = removeStoredUser();
    generationRef.current += 1;
    pendingRef.current = null;
    userRef.current = null;
    setState({ user: null, persisted });
  }, []);

  const ensureUser = useCallback(
    (displayName, { signal } = {}) => {
      if (signal?.aborted) return Promise.reject(abortReason(signal));
      if (userRef.current) return Promise.resolve(userRef.current);
      if (!pendingRef.current) {
        const generation = generationRef.current;
        const shared = createUser(displayName)
          .then((created) => {
            if (generationRef.current !== generation) {
              if (userRef.current) return userRef.current;
              throw new Error(USER_CHANGED_MESSAGE);
            }
            const user = { userId: created.id, displayName: created.displayName };
            setUser(user);
            return user;
          })
          .finally(() => {
            if (pendingRef.current === shared) pendingRef.current = null;
          });
        // The shared promise may settle with no caller left waiting; keep that rejection handled.
        shared.catch(() => {});
        pendingRef.current = shared;
      }
      return withCallerAbort(pendingRef.current, signal);
    },
    [setUser],
  );

  const value = useMemo(
    () => ({ user: state.user, persisted: state.persisted, setUser, clearUser, ensureUser }),
    [state, setUser, clearUser, ensureUser],
  );

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}
