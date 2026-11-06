// The account session in localStorage under `bha.session`:
// { accessToken, refreshToken, expiresAt, user: { id, handle, displayName, memberSince } }.
// expiresAt is epoch seconds (docs/API.md, POST /api/auth/login). Tokens are never logged.
// Every storage access is wrapped: private windows and blocked storage throw.

export const SESSION_STORAGE_KEY = 'bha.session';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listeners = new Set();

function isNonEmptyString(value) {
  return typeof value === 'string' && value !== '';
}

/** Whether `value` is a usable account user ({ id: uuid, handle }). */
export function isValidAccountUser(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.id === 'string' &&
    UUID.test(value.id) &&
    isNonEmptyString(value.handle)
  );
}

/** Whether `value` has the stored session shape. */
export function isValidSession(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    isNonEmptyString(value.accessToken) &&
    isNonEmptyString(value.refreshToken) &&
    typeof value.expiresAt === 'number' &&
    Number.isFinite(value.expiresAt) &&
    isValidAccountUser(value.user)
  );
}

function normalize(session) {
  const { user } = session;
  return {
    accessToken: session.accessToken,
    refreshToken: session.refreshToken,
    expiresAt: session.expiresAt,
    user: {
      id: user.id,
      handle: user.handle,
      displayName: typeof user.displayName === 'string' ? user.displayName : user.handle,
      memberSince: typeof user.memberSince === 'string' ? user.memberSince : null,
    },
  };
}

function removeStored() {
  try {
    localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    // Storage unavailable: nothing stored to remove.
  }
}

/** The stored session, or null. Invalid or corrupt data is removed. */
export function readSession() {
  let raw;
  try {
    raw = localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidSession(parsed)) return normalize(parsed);
  } catch {
    // Corrupt JSON: fall through and drop it.
  }
  removeStored();
  return null;
}

function notify(session, reason) {
  for (const listener of [...listeners]) listener(session, reason);
}

/**
 * Stores a session and tells the listeners. Returns the stored (normalized) session, or null when
 * the shape is invalid. When storage is unavailable the session still reaches the listeners, so
 * the user stays logged in for this page only.
 */
export function writeSession(session, reason = 'write') {
  if (!isValidSession(session)) return null;
  const value = normalize(session);
  try {
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Storage unavailable: keep going without persistence.
  }
  notify(value, reason);
  return value;
}

/**
 * Removes the session and tells the listeners. `reason` is 'logout' (the user asked) or
 * 'expired' (the server rejected the token or the refresh token).
 */
export function clearSession(reason = 'logout') {
  removeStored();
  notify(null, reason);
}

/** Another tab logged in, refreshed or logged out: tell this tab's listeners ('storage'). */
function onStorage(event) {
  // key null means another tab cleared all of localStorage.
  if (event.key !== SESSION_STORAGE_KEY && event.key !== null) return;
  notify(readSession(), 'storage');
}

/**
 * Calls listener(session | null, reason) after every write or clear, in this tab or (reason
 * 'storage') in another tab. Returns an unsubscribe.
 */
export function subscribeSession(listener) {
  if (listeners.size === 0 && typeof window !== 'undefined') {
    window.addEventListener('storage', onStorage);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && typeof window !== 'undefined') {
      window.removeEventListener('storage', onStorage);
    }
  };
}
