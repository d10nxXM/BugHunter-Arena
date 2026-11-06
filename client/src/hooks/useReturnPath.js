import { useLocation } from 'react-router';
import { paths } from '../paths.js';

/**
 * Where to go after login or signup: router state `from` when it is an in-app path
 * (starts with one "/"), otherwise `fallback`.
 */
export function useReturnPath(fallback = paths.problems) {
  const { state } = useLocation();
  const from = state?.from;
  if (typeof from === 'string' && from.startsWith('/') && !from.startsWith('//')) return from;
  return fallback;
}
