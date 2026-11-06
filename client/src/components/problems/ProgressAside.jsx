import { Link } from 'react-router';
import { difficultyClass, difficultyLabel, normalizeDifficulty } from '../../lib/labels.js';
import { isAuthEnabled } from '../../lib/authConfig.js';
import { isSolved, rankFor, totalXp } from '../../lib/xp.js';
import { paths } from '../../paths.js';
import { buttonClass } from '../ui/buttonClass.js';
import Card from '../ui/Card.jsx';
import ProgressBar from '../ui/ProgressBar.jsx';
import { DIFFICULTIES } from './filters.js';

const HEADING = 'font-display text-lg font-semibold text-heading';

function GuestCard() {
  return (
    <Card as="section" aria-labelledby="guest-heading" className="flex flex-col gap-3 p-5.5">
      <h2 id="guest-heading" className={HEADING}>
        Your progress
      </h2>
      <p className="text-sm leading-relaxed text-muted">
        Play as a guest or create an account to track progress. Pick any problem to start as a
        guest; your solved problems, XP and rank show up here.
      </p>
      <div className="flex flex-wrap gap-2.5">
        {isAuthEnabled() && (
          <Link to={paths.signup} className={buttonClass({ size: 'sm' })}>
            Create account
          </Link>
        )}
        <Link to={paths.dashboard} className={buttonClass({ variant: 'secondary', size: 'sm' })}>
          Open dashboard
        </Link>
      </div>
    </Card>
  );
}

/**
 * Right column of the Problems page: the user's progress, or a guest card without a user.
 * `challenges` is the loaded list (null while loading); `progress` comes from useChallengeStatuses.
 */
export default function ProgressAside({ challenges, progress }) {
  if (progress.status === 'guest') return <GuestCard />;

  const list = challenges ?? [];
  const solvedIds = new Set(
    progress.perChallenge.filter((e) => isSolved(e.bestScore)).map((e) => e.challengeId),
  );
  const solvedCount = list.filter((c) => solvedIds.has(c.id)).length;
  const xp = totalXp(progress.perChallenge, progress.totalXp);
  const rank = rankFor(xp);

  return (
    <Card as="section" aria-labelledby="progress-heading" className="flex flex-col gap-4 p-5.5">
      <h2 id="progress-heading" className={HEADING}>
        Your progress
      </h2>
      {progress.status === 'loading' && (
        <p role="status" className="text-sm text-muted">
          Loading your progress…
        </p>
      )}
      {progress.status === 'error' && (
        <p className="text-sm text-muted">
          <span aria-hidden="true">⚠ </span>
          Your progress could not be loaded. The problems still work.
        </p>
      )}
      {progress.status === 'ready' && challenges && (
        <>
          <p className="flex items-baseline gap-2">
            <span className="font-display text-4xl font-bold text-heading">{solvedCount}</span>
            <span className="text-sm text-subtle">/ {list.length} solved</span>
          </p>
          <ul className="flex flex-col gap-3">
            {DIFFICULTIES.map((d) => {
              const inLevel = list.filter((c) => normalizeDifficulty(c.difficulty) === d);
              const solved = inLevel.filter((c) => solvedIds.has(c.id)).length;
              const label = difficultyLabel(d);
              return (
                <li key={d}>
                  <div className="mb-1.5 flex justify-between text-sm">
                    <span className={difficultyClass(d)}>{label}</span>
                    <span className="font-mono text-muted">
                      {solved} / {inLevel.length}
                    </span>
                  </div>
                  <ProgressBar
                    value={solved}
                    max={inLevel.length}
                    label={label}
                    valueText={`${solved} of ${inLevel.length} solved`}
                    tone={d}
                  />
                </li>
              );
            })}
          </ul>
          <div className="flex flex-col gap-2 border-t border-border pt-4">
            <p className="flex items-baseline justify-between gap-2">
              <span className="text-sm text-subtle">Rank</span>
              <span className="font-display text-lg font-bold text-accent">{rank.name}</span>
            </p>
            <p className="font-mono text-sm text-muted">{xp} XP</p>
            {rank.next ? (
              <>
                <ProgressBar
                  value={rank.pct}
                  label={`Progress to ${rank.next.name}`}
                  valueText={`${rank.toNext} XP to ${rank.next.name}`}
                />
                <p className="text-sm text-subtle">
                  {rank.toNext} XP to {rank.next.name}
                </p>
              </>
            ) : (
              <p className="text-sm text-subtle">Top rank reached.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}
