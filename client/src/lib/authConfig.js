/**
 * Kill switch for accounts. VITE_AUTH_ENABLED=false hides the login, signup and profile links and
 * turns those pages into a notice; guest play is unchanged. Anything else (or unset) means on.
 * Read at call time so tests can stub it.
 */
export function isAuthEnabled() {
  return import.meta.env.VITE_AUTH_ENABLED !== 'false';
}
