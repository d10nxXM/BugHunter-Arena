import { useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router';
import { paths } from '../paths.js';

function navLinkClass({ isActive }) {
  return `rounded px-2 py-1 underline-offset-4 hover:underline focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none ${
    isActive ? 'font-semibold text-slate-900 underline' : 'text-slate-700'
  }`;
}

export default function Layout() {
  const { pathname } = useLocation();

  // Route change: move focus to the new page's h1 (pages render <h1 tabIndex={-1}>).
  useEffect(() => {
    document.querySelector('main h1')?.focus();
  }, [pathname]);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-3">
          <Link
            to={paths.home}
            className="text-lg font-bold text-slate-900 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none"
          >
            BugHunter Arena
          </Link>
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
        </div>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        <Outlet />
      </main>
    </div>
  );
}
