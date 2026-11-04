import { Suspense, useEffect, useRef } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { useUser } from '../hooks/useUser.js';
import { paths } from '../paths.js';
import ErrorBoundary from './ErrorBoundary.jsx';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';

function navLinkClass({ isActive }) {
  return `rounded px-2 py-1 underline-offset-4 hover:underline ${FOCUS_RING} ${
    isActive ? 'font-semibold text-slate-900 underline' : 'text-slate-700'
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

export default function Layout() {
  const { pathname } = useLocation();
  const { user, persisted } = useUser();
  useFocusHeadingOnNavigation(pathname);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <a
        href="#main"
        className="sr-only rounded bg-white px-3 py-2 font-medium text-sky-900 focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none"
      >
        Preskoči na sadržaj
      </a>
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link to={paths.home} className={`text-lg font-bold text-slate-900 ${FOCUS_RING}`}>
            BugHunter Arena
          </Link>
          <div className="flex flex-wrap items-center gap-4">
            <nav aria-label="Glavna navigacija">
              <ul className="flex gap-4">
                <li>
                  <NavLink to={paths.home} end className={navLinkClass}>
                    Izazovi
                  </NavLink>
                </li>
                <li>
                  <NavLink to={paths.progress} className={navLinkClass}>
                    Moj napredak
                  </NavLink>
                </li>
              </ul>
            </nav>
            {user && (
              <p className="text-sm text-slate-700">
                <span className="sr-only">Korisnik: </span>
                {user.displayName}
              </p>
            )}
          </div>
        </div>
        {!persisted && (
          <p
            role="status"
            className="border-t border-amber-300 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900"
          >
            Podaci se neće sačuvati nakon zatvaranja stranice.
          </p>
        )}
      </header>
      <main id="main" tabIndex={-1} className="mx-auto max-w-6xl px-4 py-6 focus:outline-none">
        <ErrorBoundary key={pathname}>
          <Suspense fallback={<p role="status">Učitavanje…</p>}>
            <Outlet />
          </Suspense>
        </ErrorBoundary>
      </main>
    </div>
  );
}
