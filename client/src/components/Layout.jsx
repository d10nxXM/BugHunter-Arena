import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { useUser } from '../hooks/useUser.js';
import { isAuthEnabled } from '../lib/authConfig.js';
import { initials } from '../lib/profileFormat.js';
import { paths } from '../paths.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import Badge from './ui/Badge.jsx';
import Button from './ui/Button.jsx';

const FOCUS_RING =
  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent';

function navLinkClass({ isActive }) {
  return `block rounded-lg px-3.5 py-2.5 ${FOCUS_RING} ${
    isActive ? 'bg-surface-3 text-heading' : 'text-muted hover:text-heading'
  }`;
}

/** How long to wait for a late h1 (lazy chunk) before giving up on moving focus. */
export const HEADING_WAIT_MS = 5000;

/**
 * After a navigation, moves focus to the new page's h1 (not on the first load).
 * Contract for pages: render exactly one <h1 tabIndex={-1}>, also while their data is loading,
 * so focus has a target. If the h1 is not there yet (lazy chunk still loading), wait for it, but
 * at most HEADING_WAIT_MS and only while the user has not moved focus elsewhere, so a late h1
 * never steals focus.
 */
function useFocusHeadingOnNavigation(pathname) {
  const lastPathname = useRef(pathname);

  useEffect(() => {
    // Same pathname: first mount, or StrictMode re-running the effect. Do not steal focus.
    if (lastPathname.current === pathname) return undefined;
    lastPathname.current = pathname;

    const main = document.getElementById('main');
    const focusHeading = () => {
      const h1 = main?.querySelector('h1');
      if (!h1) return false;
      h1.focus({ preventScroll: true });
      return true;
    };
    if (focusHeading() || !main) return undefined;

    // Focus at navigation time, usually the link that was clicked.
    const startFocus = document.activeElement;
    const focusMovedAway = () => {
      const active = document.activeElement;
      return active !== null && active !== document.body && active !== startFocus;
    };

    const observer = new MutationObserver(() => {
      if (focusMovedAway() || focusHeading()) stop();
    });
    const timer = setTimeout(() => stop(), HEADING_WAIT_MS);
    function stop() {
      observer.disconnect();
      clearTimeout(timer);
    }
    observer.observe(main, { childList: true, subtree: true });
    return stop;
  }, [pathname]);
}

function BugLogo() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="26"
      height="26"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="shrink-0 text-accent"
    >
      <path d="M8 2l1.9 1.9" />
      <path d="M16 2l-1.9 1.9" />
      <path d="M9 7.1V6a3 3 0 0 1 6 0v1.1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.5 13H3" />
      <path d="M21 13h-3.5" />
      <path d="M6 9.5L3.5 8" />
      <path d="M18 9.5L20.5 8" />
      <path d="M6.5 17.5L4 19" />
      <path d="M17.5 17.5L20 19" />
    </svg>
  );
}

/** A planned section: shown in the nav, but not a link until it exists. */
function SoonItem({ children }) {
  return (
    <span className="flex items-center gap-2 px-3.5 py-2.5 text-subtle">
      {children}
      <Badge tone="neutral" mono className="px-1.5 py-0.5 text-[11px]">
        Soon
      </Badge>
    </span>
  );
}

/**
 * Right side of the header: the account's avatar and "Log out", or the guest's name and
 * "Log in" (links hidden when accounts are switched off).
 */
function AccountActions({ user }) {
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

/** Notice after the server rejected the session, with a way back in. */
function SessionExpiredNotice() {
  const { account, sessionExpired, dismissExpired } = useAuth();
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

/**
 * Page width for every route except the full-bleed landing page (layout route in App.jsx).
 * `legacy` keeps pages that still use the old light styles on a light panel so their text stays
 * readable until they are redesigned.
 */
export function PageContainer({ legacy = false }) {
  const inner = legacy ? (
    <div className="rounded-[14px] bg-slate-50 p-4 text-slate-900 [color-scheme:light] sm:p-6">
      <Outlet />
    </div>
  ) : (
    <Outlet />
  );
  return <div className="mx-auto w-full max-w-[1320px] px-4 pt-10 pb-18 sm:px-6">{inner}</div>;
}

export default function Layout() {
  const { pathname } = useLocation();
  const { user, persisted } = useUser();
  useFocusHeadingOnNavigation(pathname);

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text">
      <a
        href="#main"
        className={`sr-only rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ${FOCUS_RING}`}
      >
        Skip to content
      </a>
      <header className="border-b border-track bg-nav">
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-7 gap-y-4 px-4 py-3 sm:px-6">
          <Link
            to={paths.home}
            className={`flex items-center gap-2.5 rounded-lg text-heading ${FOCUS_RING}`}
          >
            <BugLogo />
            <span className="font-display text-lg font-bold">
              BugHunter <span className="text-accent">Arena</span>
            </span>
          </Link>
          <nav aria-label="Main navigation">
            <ul className="flex flex-wrap gap-1 text-[15px] font-medium">
              <li>
                <NavLink to={paths.dashboard} className={navLinkClass}>
                  Dashboard
                </NavLink>
              </li>
              <li>
                <NavLink to={paths.problems} className={navLinkClass}>
                  Problems
                </NavLink>
              </li>
              <li>
                <SoonItem>Arena</SoonItem>
              </li>
              <li>
                <SoonItem>Leaderboard</SoonItem>
              </li>
            </ul>
          </nav>
          <div className="flex flex-[1_1_200px] flex-wrap items-center justify-end gap-3">
            <AccountActions user={user} />
            <Button to={paths.problems}>Start hunting</Button>
          </div>
        </div>
        <SessionExpiredNotice />
        {!persisted && (
          <p
            role="status"
            className="border-t border-amber-soft bg-amber-soft px-4 py-2 text-center text-sm text-amber"
          >
            <span aria-hidden="true">⚠ </span>
            Your data will not be saved after you close this page.
          </p>
        )}
      </header>
      <main id="main" tabIndex={-1} className="flex-1 focus:outline-none">
        <ErrorBoundary key={pathname}>
          <Suspense
            fallback={
              <p role="status" className="mx-auto max-w-[1320px] px-4 py-10 text-muted sm:px-6">
                Loading…
              </p>
            }
          >
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
