import { useContext } from 'react';
import { UserContext } from '../context/UserContext.js';

/**
 * Returns { user, persisted, setUser, clearUser, ensureUser } (see UserProvider).
 * user is { userId, displayName } or null.
 */
export function useUser() {
  const value = useContext(UserContext);
  if (value === null) {
    throw new Error('useUser must be used inside <UserProvider>.');
  }
  return value;
}
