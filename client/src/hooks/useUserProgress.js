import { useEffect, useRef, useState } from 'react';
import {
  ApiError,
  getAttempts,
  getChallenges,
  getProgress,
  nextAttemptsPage,
} from '../api/client.js';

const PAGE_SIZE = 20;
export const GENERIC_ERROR = 'Podaci nisu učitani. Pokušaj ponovo.';

function errorMessage(error) {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

function isAbort(error, signal) {
  return signal.aborted || error?.name === 'AbortError';
}

function isValidProgress(value) {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    ['attempted', 'solved', 'totalScore'].every((key) => Number.isFinite(value[key]))
  );
}

/** Moves focus to ref.current every time request goes up (0 means never). */
function useFocusRequest(ref, request) {
  useEffect(() => {
    if (request > 0) ref.current?.focus();
  }, [ref, request]);
}

/**
 * Server state for one user's progress page: summary, paged history and challenge titles,
 * plus retry/load-more actions and the refs that receive focus after them.
 * Use it under key={userId} so state resets per user.
 */
export function useUserProgress(userId) {
  const [progress, setProgress] = useState({ status: 'loading', data: null, error: null });
  const [progressReload, setProgressReload] = useState(0);
  const [history, setHistory] = useState({
    status: 'loading',
    items: [],
    hasMore: false,
    error: null,
  });
  const [historyReload, setHistoryReload] = useState(0);
  const [more, setMore] = useState({ loading: false, error: null, announcement: '' });
  const [titles, setTitles] = useState(() => new Map());
  const [focus, setFocus] = useState({ progress: 0, history: 0, end: 0 });
  const progressHeadingRef = useRef(null);
  const historyHeadingRef = useRef(null);
  const endRef = useRef(null);
  const moreControllerRef = useRef(null);
  useFocusRequest(progressHeadingRef, focus.progress);
  useFocusRequest(historyHeadingRef, focus.history);
  useFocusRequest(endRef, focus.end);

  const requestFocus = (key) => setFocus((prev) => ({ ...prev, [key]: prev[key] + 1 }));

  useEffect(() => {
    const controller = new AbortController();
    getProgress(userId, { signal: controller.signal })
      .then((data) => {
        if (!isValidProgress(data)) {
          setProgress({ status: 'error', data: null, error: GENERIC_ERROR });
          return;
        }
        setProgress({ status: 'ready', data, error: null });
      })
      .catch((error) => {
        if (isAbort(error, controller.signal)) return;
        setProgress({ status: 'error', data: null, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [userId, progressReload]);

  useEffect(() => {
    const controller = new AbortController();
    getAttempts({ userId, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((page) => {
        if (!Array.isArray(page)) {
          setHistory({ status: 'error', items: [], hasMore: false, error: GENERIC_ERROR });
          return;
        }
        setHistory({
          status: 'ready',
          items: page,
          hasMore: nextAttemptsPage(page, PAGE_SIZE) !== null,
          error: null,
        });
      })
      .catch((error) => {
        if (isAbort(error, controller.signal)) return;
        setHistory({ status: 'error', items: [], hasMore: false, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [userId, historyReload]);

  // Titles are cosmetic: without them the tables show challenge ids.
  useEffect(() => {
    const controller = new AbortController();
    getChallenges({ signal: controller.signal })
      .then((list) => {
        if (Array.isArray(list)) setTitles(new Map(list.map((c) => [c.id, c.title])));
      })
      .catch((error) => {
        if (isAbort(error, controller.signal)) return;
        if (import.meta.env.DEV) console.warn('[progress] challenge titles not loaded');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => moreControllerRef.current?.abort(), []);

  function retryProgress() {
    setProgress({ status: 'loading', data: null, error: null });
    setProgressReload((n) => n + 1);
    // The retry button unmounts; keep focus inside the section.
    requestFocus('progress');
  }

  function retryHistory() {
    moreControllerRef.current?.abort();
    setMore({ loading: false, error: null, announcement: '' });
    setHistory({ status: 'loading', items: [], hasMore: false, error: null });
    setHistoryReload((n) => n + 1);
    requestFocus('history');
  }

  async function loadMore() {
    const next = nextAttemptsPage(history.items, PAGE_SIZE);
    if (!next || more.loading) return;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setMore({ loading: true, error: null, announcement: 'Učitavanje pokušaja…' });
    try {
      const page = await getAttempts(
        { userId, limit: PAGE_SIZE, cursor: next.cursor, cursorId: next.cursorId },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      const items = Array.isArray(page) ? page : [];
      const hasMore = nextAttemptsPage(items, PAGE_SIZE) !== null;
      setHistory((prev) => ({ ...prev, items: [...prev.items, ...items], hasMore }));
      setMore({
        loading: false,
        error: null,
        announcement: `Učitano još ${items.length} pokušaja.`,
      });
      // At the end the button is replaced by text; move focus there so it is not lost.
      if (!hasMore) requestFocus('end');
    } catch (error) {
      if (isAbort(error, controller.signal)) return;
      setMore({ loading: false, error: errorMessage(error), announcement: '' });
    }
  }

  return {
    progress,
    history,
    more,
    titles,
    progressHeadingRef,
    historyHeadingRef,
    endRef,
    retryProgress,
    retryHistory,
    loadMore,
  };
}
