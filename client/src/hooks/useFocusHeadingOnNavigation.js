import { useEffect, useRef } from 'react';

/** How long to wait for a late h1 (lazy chunk) before giving up on moving focus. */
export const HEADING_WAIT_MS = 5000;

/**
 * After a navigation, moves focus to the new page's h1 (not on the first load).
 * Contract for pages: render exactly one <h1 tabIndex={-1}>, also while their data is loading,
 * so focus has a target. If the h1 is not there yet (lazy chunk still loading), wait for it, but
 * at most HEADING_WAIT_MS and only while the user has not moved focus elsewhere, so a late h1
 * never steals focus.
 */
export function useFocusHeadingOnNavigation(pathname) {
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
