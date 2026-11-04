import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import {
  ApiError,
  createUser,
  getAttempts,
  getChallenges,
  getProgress,
  nextAttemptsPage,
} from '../api/client.js';
import ProgressHistory from '../components/ProgressHistory.jsx';
import ProgressNameForm from '../components/ProgressNameForm.jsx';
import ProgressSummary from '../components/ProgressSummary.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { useUser } from '../hooks/useUser.js';
import { paths } from '../paths.js';

const PAGE_SIZE = 20;
const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const BUTTON = `rounded border border-slate-500 px-3 py-1.5 hover:bg-slate-100 ${FOCUS_RING}`;
const LINK = `text-sky-800 underline underline-offset-4 ${FOCUS_RING}`;
const GENERIC_ERROR = 'Podaci nisu učitani. Pokušaj ponovo.';

function errorMessage(error) {
  return error instanceof ApiError ? error.message : GENERIC_ERROR;
}

function isAbort(error, signal) {
  return signal.aborted || error?.name === 'AbortError';
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
      <button type="button" onClick={onRetry} className={`mt-2 bg-white ${BUTTON}`}>
        Pokušaj ponovo
      </button>
    </div>
  );
}

/** Progress and history for one user. Mounted with key={userId}, so state resets per user. */
function UserProgress({ userId }) {
  const [progress, setProgress] = useState({ status: 'loading', data: null, error: null });
  const [progressReload, setProgressReload] = useState(0);
  const [history, setHistory] = useState({
    status: 'loading',
    items: [],
    hasMore: false,
    error: null,
  });
  const [historyReload, setHistoryReload] = useState(0);
  const [more, setMore] = useState({ loading: false, error: null });
  const [titles, setTitles] = useState(() => new Map());
  const [endFocus, setEndFocus] = useState(0);
  const endRef = useRef(null);
  const moreControllerRef = useRef(null);
  useFocusRequest(endRef, endFocus);

  useEffect(() => {
    const controller = new AbortController();
    getProgress(userId, { signal: controller.signal })
      .then((data) => setProgress({ status: 'ready', data, error: null }))
      .catch((error) => {
        if (isAbort(error, controller.signal)) return;
        setProgress({ status: 'error', data: null, error: errorMessage(error) });
      });
    return () => controller.abort();
  }, [userId, progressReload]);

  useEffect(() => {
    const controller = new AbortController();
    getAttempts({ userId, limit: PAGE_SIZE }, { signal: controller.signal })
      .then((items) => {
        const page = Array.isArray(items) ? items : [];
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
        if (!Array.isArray(list)) return;
        setTitles(new Map(list.map((c) => [c.id, c.title])));
      })
      .catch((error) => {
        if (isAbort(error, controller.signal)) return;
        if (import.meta.env.DEV) console.warn('[dashboard] challenge titles not loaded');
      });
    return () => controller.abort();
  }, []);

  useEffect(() => () => moreControllerRef.current?.abort(), []);

  function retryProgress() {
    setProgress({ status: 'loading', data: null, error: null });
    setProgressReload((n) => n + 1);
  }

  function retryHistory() {
    setMore({ loading: false, error: null });
    setHistory({ status: 'loading', items: [], hasMore: false, error: null });
    setHistoryReload((n) => n + 1);
  }

  async function loadMore() {
    const next = nextAttemptsPage(history.items, PAGE_SIZE);
    if (!next || more.loading) return;
    const controller = new AbortController();
    moreControllerRef.current = controller;
    setMore({ loading: true, error: null });
    try {
      const page = await getAttempts(
        { userId, limit: PAGE_SIZE, cursor: next.cursor, cursorId: next.cursorId },
        { signal: controller.signal },
      );
      const items = Array.isArray(page) ? page : [];
      const hasMore = nextAttemptsPage(items, PAGE_SIZE) !== null;
      setHistory((prev) => ({ ...prev, items: [...prev.items, ...items], hasMore }));
      setMore({ loading: false, error: null });
      // The button disappears at the end; keep focus on the text that replaces it.
      if (!hasMore) setEndFocus((n) => n + 1);
    } catch (error) {
      if (isAbort(error, controller.signal)) return;
      setMore({ loading: false, error: errorMessage(error) });
    }
  }

  return (
    <>
      <section aria-labelledby="progress-summary" className="mt-8">
        <h2 id="progress-summary" className="mb-3 text-xl font-semibold">
          Pregled
        </h2>
        <div aria-live="polite" aria-busy={progress.status === 'loading'}>
          {progress.status === 'loading' && <p className="text-slate-700">Učitavanje napretka…</p>}
          {progress.status === 'error' && (
            <ErrorWithRetry message={progress.error} onRetry={retryProgress} />
          )}
          {progress.status === 'ready' &&
            (progress.data.attempted > 0 || progress.data.perChallenge?.length > 0 ? (
              <ProgressSummary progress={progress.data} titles={titles} />
            ) : (
              <p className="text-slate-800">
                Još nemaš nijedan pokušaj.{' '}
                <Link to={paths.home} className={LINK}>
                  Izaberi izazov
                </Link>
              </p>
            ))}
        </div>
      </section>

      <section aria-labelledby="progress-history" className="mt-8">
        <h2 id="progress-history" className="mb-3 text-xl font-semibold">
          Istorija pokušaja
        </h2>
        <div aria-live="polite" aria-busy={history.status === 'loading'}>
          {history.status === 'loading' && <p className="text-slate-700">Učitavanje pokušaja…</p>}
          {history.status === 'error' && (
            <ErrorWithRetry message={history.error} onRetry={retryHistory} />
          )}
        </div>
        {history.status === 'ready' && (
          <ProgressHistory
            items={history.items}
            titles={titles}
            hasMore={history.hasMore}
            loadingMore={more.loading}
            loadMoreError={more.error}
            onLoadMore={loadMore}
            endRef={endRef}
          />
        )}
      </section>
    </>
  );
}

export default function Dashboard() {
  usePageTitle('Moj napredak');
  const { user, persisted, setUser, clearUser, ensureUser } = useUser();
  const [editing, setEditing] = useState(false);
  const [focusRequest, setFocusRequest] = useState(0);
  const sectionHeadingRef = useRef(null);
  useFocusRequest(sectionHeadingRef, focusRequest);

  const requestFocus = () => setFocusRequest((n) => n + 1);

  async function createFirstUser(displayName, { signal }) {
    await ensureUser(displayName, { signal });
    requestFocus();
  }

  async function changeName(displayName, { signal }) {
    // A new name is a new user; the old one stays until this succeeds.
    const created = await createUser(displayName, { signal });
    setUser({ userId: created.id, displayName: created.displayName });
    setEditing(false);
    requestFocus();
  }

  function removeName() {
    clearUser();
    setEditing(false);
    requestFocus();
  }

  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Moj napredak
      </h1>

      {!user ? (
        <section aria-labelledby="progress-name" className="mt-6">
          <h2
            id="progress-name"
            ref={sectionHeadingRef}
            tabIndex={-1}
            className="mb-2 text-xl font-semibold focus:outline-none"
          >
            Tvoje ime
          </h2>
          <p className="mb-4 text-slate-800">
            Unesi ime da bi se tvoji pokušaji čuvali i prikazali ovdje.
          </p>
          <ProgressNameForm
            onSubmit={createFirstUser}
            submitLabel="Sačuvaj ime"
            persisted={persisted}
          />
        </section>
      ) : (
        <>
          <section aria-labelledby="progress-user" className="mt-6">
            <h2
              id="progress-user"
              ref={sectionHeadingRef}
              tabIndex={-1}
              className="mb-2 text-xl font-semibold focus:outline-none"
            >
              Korisnik
            </h2>
            {editing ? (
              <>
                <p className="mb-4 text-slate-800">
                  Novo ime pravi novi profil. Dosadašnji napredak ostaje uz ime {user.displayName}.
                </p>
                <ProgressNameForm
                  onSubmit={changeName}
                  submitLabel="Sačuvaj novo ime"
                  initialName={user.displayName}
                  onCancel={() => {
                    setEditing(false);
                    requestFocus();
                  }}
                  focusOnMount
                  persisted={persisted}
                />
              </>
            ) : (
              <>
                <p className="text-slate-800">
                  Ime: <span className="font-semibold">{user.displayName}</span>
                </p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <button type="button" onClick={() => setEditing(true)} className={BUTTON}>
                    Promijeni ime
                  </button>
                  <button type="button" onClick={removeName} className={BUTTON}>
                    Ukloni ime
                  </button>
                </div>
              </>
            )}
          </section>
          <UserProgress key={user.userId} userId={user.userId} />
        </>
      )}
    </>
  );
}
