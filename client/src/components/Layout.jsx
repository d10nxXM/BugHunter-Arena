import { Suspense, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useFocusHeadingOnNavigation } from '../hooks/useFocusHeadingOnNavigation.js';
import { useUser } from '../hooks/useUser.js';
import { paths } from '../paths.js';
import ErrorBoundary from './ErrorBoundary.jsx';
import AccountActions from './layout/AccountActions.jsx';
import { FOCUS_RING } from './layout/focusRing.js';
import SessionExpiredNotice from './layout/SessionExpiredNotice.jsx';
import Badge from './ui/Badge.jsx';
import Button from './ui/Button.jsx';

function navLinkClass({ isActive }) {
  return `block rounded-lg px-3.5 py-2.5 ${FOCUS_RING} ${
    isActive ? 'bg-surface-3 text-heading' : 'text-muted hover:text-heading'
  }`;
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

function MenuIcon({ open }) {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
    >
      {open ? (
        <>
          <path d="M6 6l12 12" />
          <path d="M18 6L6 18" />
        </>
      ) : (
        <>
          <path d="M4 7h16" />
          <path d="M4 12h16" />
          <path d="M4 17h16" />
        </>
      )}
    </svg>
  );
}

/** Page width for every route except the full-bleed landing page (layout route in App.jsx). */
export function PageContainer() {
  return (
    <div className="mx-auto w-full max-w-[1320px] px-4 pt-8 pb-18 sm:px-6 sm:pt-10">
      <Outlet />
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  const { user, persisted } = useUser();
  useFocusHeadingOnNavigation(pathname);
  // Below lg the nav and account actions sit behind a menu button. Navigating closes it: the
  // reset happens during render (no effect), so a later visit to the same page starts closed.
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuPath, setMenuPath] = useState(pathname);
  if (menuPath !== pathname) {
    setMenuPath(pathname);
    setMenuOpen(false);
  }
  const menuButtonRef = useRef(null);

  function closeMenuOnEscape(event) {
    if (event.key !== 'Escape' || !menuOpen) return;
    setMenuOpen(false);
    menuButtonRef.current?.focus();
  }

  // A link to the page you are already on does not change the path, so close on any link click.
  function closeMenuOnLinkClick(event) {
    if (event.target instanceof Element && event.target.closest('a')) setMenuOpen(false);
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg font-sans text-text">
      <a
        href="#main"
        className={`sr-only rounded-lg bg-accent px-3 py-2 font-semibold text-accent-ink focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 ${FOCUS_RING}`}
      >
        Skip to content
      </a>
      <header className="border-b border-track bg-nav" onKeyDown={closeMenuOnEscape}>
        <div className="mx-auto flex max-w-[1320px] flex-wrap items-center gap-x-7 px-4 py-3 sm:px-6">
          <Link
            to={paths.home}
            className={`flex items-center gap-2.5 rounded-lg text-heading ${FOCUS_RING}`}
          >
            <BugLogo />
            <span className="font-display text-lg font-bold">
              BugHunter <span className="text-accent">Arena</span>
            </span>
          </Link>
          <button
            ref={menuButtonRef}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="site-menu"
            onClick={() => setMenuOpen((open) => !open)}
            className={`ml-auto flex size-11 items-center justify-center rounded-lg border border-border-strong text-heading hover:bg-surface-3 lg:hidden ${FOCUS_RING}`}
          >
            <MenuIcon open={menuOpen} />
            <span className="sr-only">Menu</span>
          </button>
          <div
            id="site-menu"
            onClick={closeMenuOnLinkClick}
            className={`${menuOpen ? 'flex' : 'hidden'} w-full flex-col gap-4 pt-4 pb-2 lg:flex lg:w-auto lg:flex-1 lg:flex-row lg:items-center lg:gap-7 lg:p-0`}
          >
            <nav aria-label="Main navigation">
              <ul className="flex flex-col gap-1 text-[15px] font-medium lg:flex-row">
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
                  <NavLink to={paths.leaderboard} className={navLinkClass}>
                    Leaderboard
                  </NavLink>
                </li>
              </ul>
            </nav>
            <div className="flex flex-wrap items-center gap-3 border-t border-track pt-4 lg:ml-auto lg:justify-end lg:border-0 lg:pt-0">
              <AccountActions user={user} />
              <Button to={paths.problems} className="max-lg:ml-auto">
                Start hunting
              </Button>
            </div>
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
