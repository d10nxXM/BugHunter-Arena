import { Link, useLocation } from 'react-router';
import { useAuth } from '../../hooks/useAuth.js';
import { isAuthEnabled } from '../../lib/authConfig.js';
import { paths } from '../../paths.js';
import { FOCUS_RING } from './focusRing.js';

/** Notice after the server rejected the session, with a way back in to the current page. */
export default function SessionExpiredNotice() {
  const { account, sessionExpired, dismissExpired } = useAuth();
  const { pathname } = useLocation();
  if (!sessionExpired || account || !isAuthEnabled()) return null;
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 border-t border-amber-soft bg-amber-soft px-4 py-2 text-sm text-amber"
    >
      <p>
        <span aria-hidden="true">⚠ </span>
        Your session has expired. Log in again so new attempts count on your profile.
      </p>
      <Link
        to={paths.login}
        state={{ from: pathname }}
        onClick={dismissExpired}
        className={`rounded font-semibold underline ${FOCUS_RING}`}
      >
        Log in again
      </Link>
      <button
        type="button"
        onClick={dismissExpired}
        className={`rounded px-1 font-semibold ${FOCUS_RING}`}
      >
        Dismiss
      </button>
    </div>
  );
}
