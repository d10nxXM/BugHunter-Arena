import { useContext } from 'react';
import { UserContext } from '../context/UserContext.js';

/** Returns { user, setUser, clearUser }. user is { userId, displayName } or null. */
export function useUser() {
  return useContext(UserContext);
}
