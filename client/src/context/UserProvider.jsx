import { useState } from 'react';
import { USER_STORAGE_KEY, UserContext } from './UserContext.js';

function isValidUser(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    typeof value.userId === 'string' &&
    typeof value.displayName === 'string'
  );
}

function removeStoredUser() {
  try {
    localStorage.removeItem(USER_STORAGE_KEY);
  } catch {
    // Storage blocked (private mode, disabled site data): nothing to remove.
  }
}

/** Reads { userId, displayName } from localStorage. Invalid data is removed and gives null. */
function readStoredUser() {
  let raw;
  try {
    raw = localStorage.getItem(USER_STORAGE_KEY);
  } catch {
    return null;
  }
  if (raw === null) return null;
  try {
    const parsed = JSON.parse(raw);
    if (isValidUser(parsed)) return { userId: parsed.userId, displayName: parsed.displayName };
  } catch {
    // Corrupt JSON: fall through and drop it.
  }
  removeStoredUser();
  return null;
}

export default function UserProvider({ children }) {
  const [user, setUserState] = useState(readStoredUser);

  function setUser(next) {
    const value = { userId: next.userId, displayName: next.displayName };
    setUserState(value);
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(value));
    } catch {
      // Storage blocked: the user still works for this session.
    }
  }

  function clearUser() {
    setUserState(null);
    removeStoredUser();
  }

  return (
    <UserContext.Provider value={{ user, setUser, clearUser }}>{children}</UserContext.Provider>
  );
}
