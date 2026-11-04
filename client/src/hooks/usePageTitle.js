import { useEffect } from 'react';

export const APP_TITLE = 'BugHunter Arena';

/** Sets document.title to `${title} · BugHunter Arena` while the page is shown. */
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} · ${APP_TITLE}` : APP_TITLE;
    return () => {
      document.title = APP_TITLE;
    };
  }, [title]);
}
