import { Link } from 'react-router';
import { useUserProgress } from '../hooks/useUserProgress.js';
import { paths } from '../paths.js';
import ProgressHistory from './ProgressHistory.jsx';
import ProgressSummary from './ProgressSummary.jsx';

const FOCUS_RING = 'focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const LINK = `text-sky-800 underline underline-offset-4 ${FOCUS_RING}`;
const H2 = 'mb-3 text-xl font-semibold focus:outline-none';

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
 * Server state lives in useUserProgress and is passed down to ProgressSummary and ProgressHistory.
 */
export default function UserProgress({ userId }) {
  const {
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
  } = useUserProgress(userId);

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
