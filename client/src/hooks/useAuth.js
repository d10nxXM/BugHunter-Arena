import { useContext } from 'react';
import { AuthContext } from '../context/AuthContext.js';

/** Returns { account, sessionExpired, login, signup, logout, dismissExpired } (see AuthProvider). */
export function useAuth() {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used inside <AuthProvider>.');
  }
  return value;
}
