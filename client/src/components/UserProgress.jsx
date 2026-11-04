import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ApiError,
  getAttempts,
  getChallenges,
  getProgress,
  nextAttemptsPage,
} from '../api/client.js';
import { paths } from '../paths.js';
import ProgressHistory from './ProgressHistory.jsx';
import ProgressSummary from './ProgressSummary.jsx';

const PAGE_SIZE = 20;
const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const LINK = `text-sky-800 underline underline-offset-4 ${FOCUS_RING}`;
const GENERIC_ERROR = 'Podaci nisu učitani. Pokušaj ponovo.';
const H2 = 'mb-3 text-xl font-semibold focus:outline-none';

function errorMessage(error) {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

function isAbort(error, signal) {
  return signal.aborted || error?.name === 'AbortError';
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Moves focus to ref.current every time request goes up (0 means never). */
function useFocusRequest(ref, request) {
  useEffect(() => {
    if (request > 0) ref.current?.focus();
  }, [ref, request]);
}

function ErrorWithRetry({ message, onRetry }) {
  return (
    <div role="alert" className="rounded border border-red-700 bg-red-50 p-3 text-red-900">
      <p>{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className={`mt-2 rounded border border-slate-500 bg-white px-3 py-1.5 hover:bg-slate-100 ${FOCUS_RING}`}
      >
        Pokušaj ponovo
      </button>
    </div>
  );
}

const PROGRESS_STATUS = { loading: 'Učitavanje napretka…', ready: 'Napredak učitan.', error: '' };
const HISTORY_STATUS = { loading: 'Učitavanje pokušaja…', ready: 'Pokušaji učitani.', error: '' };

/**
 * Progress and history for one user. Mount it with key={userId}, so state resets per user.
 * Server state lives here and is passed down to ProgressSummary and ProgressHistory.
 */
export default function UserProgress({ userId }) {
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
        if (!isPlainObject(data)) {
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

  const summary = progress.data;
  const hasAttempts = summary && (summary.attempted > 0 || (summary.perChallenge?.length ?? 0) > 0);

  return (
    <>
      <section aria-labelledby="progress-summary" className="mt-8">
        <h2 id="progress-summary" ref={progressHeadingRef} tabIndex={-1} className={H2}>
          Pregled
        </h2>
        <p role="status" className={progress.status === 'loading' ? 'text-slate-700' : 'sr-only'}>
          {PROGRESS_STATUS[progress.status]}
        </p>
        {progress.status === 'error' && (
          <ErrorWithRetry message={progress.error} onRetry={retryProgress} />
        )}
        {progress.status === 'ready' &&
          (hasAttempts ? (
            <ProgressSummary progress={summary} titles={titles} />
          ) : (
            <p className="text-slate-800">
              Još nemaš nijedan pokušaj.{' '}
              <Link to={paths.home} className={LINK}>
                Izaberi izazov
              </Link>
            </p>
          ))}
      </section>

      <section aria-labelledby="progress-history" className="mt-8">
        <h2 id="progress-history" ref={historyHeadingRef} tabIndex={-1} className={H2}>
          Istorija pokušaja
        </h2>
        <p role="status" className={history.status === 'loading' ? 'text-slate-700' : 'sr-only'}>
          {HISTORY_STATUS[history.status]}
        </p>
        {history.status === 'error' && (
          <ErrorWithRetry message={history.error} onRetry={retryHistory} />
        )}
        {history.status === 'ready' && (
          <ProgressHistory
            items={history.items}
            titles={titles}
            hasMore={history.hasMore}
            loadingMore={more.loading}
            loadMoreError={more.error}
            announcement={more.announcement}
            onLoadMore={loadMore}
            endRef={endRef}
          />
        )}
      </section>
    </>
  );
}
