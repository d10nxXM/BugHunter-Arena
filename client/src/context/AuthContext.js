import { createContext } from 'react';

/**
 * { account, sessionExpired, login, signup, logout, dismissExpired }, provided by AuthProvider.
 * account is { id, handle, displayName, memberSince } or null.
 */
export const AuthContext = createContext(null);
