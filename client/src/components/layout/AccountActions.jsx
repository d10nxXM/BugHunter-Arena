import { Link } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import { isAuthEnabled } from '../../lib/authConfig.js';
import { initials } from '../../lib/profileFormat.js';
import { paths } from '../../paths.js';
import { FOCUS_RING } from './focusRing.js';

/**
 * Right side of the header: the account's avatar and "Log out", or the guest's name and
 * "Log in" (links hidden when accounts are switched off).
 */
export default function AccountActions({ user }) {
  const { account, logout } = useAuth();
  const authOn = isAuthEnabled();

  function onLogout() {
    logout();
    // The button disappears; keep keyboard focus inside the page.
    document.getElementById('main')?.focus();
  }

  if (account && authOn) {
    return (
      <>
        <Link
          to={paths.profile(account.handle)}
          aria-label={`Your profile (@${account.handle})`}
          className={`flex size-10 items-center justify-center rounded-[10px] border border-accent bg-accent-soft text-sm font-bold text-accent ${FOCUS_RING}`}
        >
          <span aria-hidden="true">{initials(account.handle)}</span>
        </Link>
        <button
          type="button"
          onClick={onLogout}
          className={`rounded-lg px-3 py-2.5 text-[15px] font-medium text-muted hover:text-heading ${FOCUS_RING}`}
        >
          Log out
        </button>
      </>
    );
  }
  return (
    <>
      {user && (
        <p className="text-sm text-muted">
          <span className="sr-only">Playing as </span>
          {user.displayName}
        </p>
      )}
      {authOn && (
        <Link
          to={paths.login}
          className={`rounded-lg px-4 py-2.5 text-[15px] font-medium text-muted hover:text-heading ${FOCUS_RING}`}
        >
          Log in
        </Link>
      )}
    </>
  );
}
