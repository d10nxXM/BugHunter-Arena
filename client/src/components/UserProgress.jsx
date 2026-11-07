import { useNavigate } from 'react-router';
import { useUserProgress } from '../hooks/useUserProgress.js';
import {
  continueTarget,
  recommendations,
  skillsByCategory,
  unsolvedChallenges,
} from '../lib/dashboard.js';
import { paths } from '../paths.js';
import ContinueCard from './dashboard/ContinueCard.jsx';
import DashboardHeader from './dashboard/DashboardHeader.jsx';
import RecentActivity from './dashboard/RecentActivity.jsx';
import RecommendedList from './dashboard/RecommendedList.jsx';
import SkillsCard from './dashboard/SkillsCard.jsx';
import ProgressHistory from './ProgressHistory.jsx';
import ProgressSummary from './ProgressSummary.jsx';
import Button from './ui/Button.jsx';
import Notice from './ui/Notice.jsx';

const H2 = 'font-display text-[19px] font-semibold text-heading focus:outline-none';

function ErrorWithRetry({ message, onRetry }) {
  return (
    <Notice role="alert" tone="danger">
      <p>{message}</p>
      <div>
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Try again
        </Button>
      </div>
    </Notice>
  );
}

function ShuffleIcon() {
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 3h5v5" />
      <path d="M4 20L21 3" />
      <path d="M21 16v5h-5" />
      <path d="M15 15l6 6" />
      <path d="M4 4l5 5" />
    </svg>
  );
}

const PROGRESS_STATUS = { loading: 'Loading your progress…', ready: 'Progress loaded.', error: '' };
const HISTORY_STATUS = { loading: 'Loading attempts…', ready: 'Attempts loaded.', error: '' };

/**
 * The dashboard for one user: header, stats, what to do next, skills and history.
 * Mount it with key={userId}, so state resets per user. Server state lives in useUserProgress
 * and is passed down. `hunterCard` (the name settings) is rendered in the side column.
 */
export default function UserProgress({ userId, name, hunterCard = null }) {
  const navigate = useNavigate();
  const {
    progress,
    history,
    more,
    titles,
    challenges,
    progressHeadingRef,
    historyHeadingRef,
    endRef,
    retryProgress,
    retryHistory,
    loadMore,
  } = useUserProgress(userId);

  const summary = progress.data;
  const ready = progress.status === 'ready';
  const hasAttempts = summary && (summary.attempted > 0 || (summary.perChallenge?.length ?? 0) > 0);
  const perChallenge = summary?.perChallenge ?? [];
  const items = history.status === 'ready' ? history.items : [];

  const unsolved = ready && challenges ? unsolvedChallenges(challenges, perChallenge) : [];
  const target = ready && challenges ? continueTarget(challenges, perChallenge, items) : null;
  const recommended =
    ready && challenges
      ? recommendations(challenges, perChallenge, summary.weakCategories, target?.challenge.id)
      : [];

  function randomChallenge() {
    const pool = unsolved.length > 0 ? unsolved : (challenges ?? []);
    if (pool.length === 0) {
      navigate(paths.problems);
      return;
    }
    navigate(paths.challenge(pool[Math.floor(Math.random() * pool.length)].id));
  }

  return (
    <div className="flex flex-col gap-7">
      <DashboardHeader
        name={name}
        title={`Welcome back, ${name}`}
        action={
          <Button onClick={randomChallenge}>
            <ShuffleIcon />
            Random challenge
          </Button>
        }
      />

      <section aria-labelledby="progress-summary" className="flex flex-col gap-4">
        <h2 id="progress-summary" ref={progressHeadingRef} tabIndex={-1} className="sr-only">
          Overview
        </h2>
        <p role="status" className={progress.status === 'loading' ? 'text-muted' : 'sr-only'}>
          {PROGRESS_STATUS[progress.status]}
        </p>
        {progress.status === 'error' && (
          <ErrorWithRetry message={progress.error} onRetry={retryProgress} />
        )}
        {ready && <ProgressSummary progress={summary} challenges={challenges} />}
        {ready && !hasAttempts && (
          <p className="text-muted">
            You have no attempts yet. Pick a challenge below or press “Random challenge”.
          </p>
        )}
      </section>

      <div className="flex flex-wrap items-start gap-5">
        <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
          {ready && challenges && (
            <>
              <ContinueCard target={target} hasChallenges={challenges.length > 0} />
              <RecommendedList challenges={recommended} />
            </>
          )}

          <section
            aria-labelledby="progress-history"
            className="flex flex-col gap-4 rounded-[14px] border border-border bg-surface p-6"
          >
            <h2 id="progress-history" ref={historyHeadingRef} tabIndex={-1} className={H2}>
              Attempt history
            </h2>
            <p role="status" className={history.status === 'loading' ? 'text-muted' : 'sr-only'}>
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
        </div>

        <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
          {ready && challenges && (
            <SkillsCard
              skills={skillsByCategory(challenges, perChallenge, summary.weakCategories)}
            />
          )}
          {history.status === 'ready' && <RecentActivity items={items} titles={titles} />}
          {hunterCard}
        </aside>
      </div>
    </div>
  );
}
