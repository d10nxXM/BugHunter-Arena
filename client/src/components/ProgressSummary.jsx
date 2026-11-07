import { solvedBreakdown } from '../lib/dashboard.js';
import { formatDuration } from '../lib/progressFormat.js';
import { rankFor, totalXp } from '../lib/xp.js';
import ProgressBar from './ui/ProgressBar.jsx';

const NUMBER = new Intl.NumberFormat('en-US');

function Tile({ label, children }) {
  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-border bg-surface p-5.5">
      <dt className="font-mono text-xs text-subtle uppercase">{label}</dt>
      {children}
    </div>
  );
}

const VALUE = 'font-display text-[32px] leading-tight font-bold text-heading tabular-nums';
const NOTE = 'text-[13px] text-subtle';

/**
 * Stat tiles from GET /api/progress: total XP, rank, bugs found and average solve time.
 * `challenges` (GET /api/challenges, null until loaded) splits the solved count by difficulty.
 * @param {{
 *   progress: {
 *     totalScore: number, totalXp?: number, solved: number, attempted: number,
 *     averageDurationSec: number,
 *     perChallenge: Array<{ challengeId: string, bestScore: number, attempts: number, xp?: number }>,
 *   },
 *   challenges: Array<{ id: string, difficulty: string }> | null,
 * }} props
 */
export default function ProgressSummary({ progress, challenges }) {
  const perChallenge = Array.isArray(progress.perChallenge) ? progress.perChallenge : [];
  const xp = totalXp(perChallenge, progress.totalXp);
  const rank = rankFor(xp);
  const split = challenges ? solvedBreakdown(challenges, perChallenge).byDifficulty : null;

  return (
    <dl className="grid grid-cols-[repeat(auto-fit,minmax(220px,1fr))] gap-4">
      <Tile label="Total XP">
        <dd className={VALUE}>{NUMBER.format(xp)}</dd>
        <dd className={NOTE}>Total score {NUMBER.format(progress.totalScore)}</dd>
      </Tile>
      <Tile label="Rank">
        <dd className={`${VALUE} text-amber`}>{rank.name}</dd>
        {rank.next ? (
          <>
            <dd>
              <ProgressBar
                value={rank.pct}
                label={`Progress to ${rank.next.name}`}
                valueText={`${rank.toNext} XP to ${rank.next.name}`}
                tone="amber"
              />
            </dd>
            <dd className={NOTE}>
              {rank.toNext} XP to {rank.next.name}
            </dd>
          </>
        ) : (
          <dd className={NOTE}>Top rank reached</dd>
        )}
      </Tile>
      <Tile label="Bugs found">
        <dd className={VALUE}>{NUMBER.format(progress.solved)}</dd>
        {split && (
          <dd className={NOTE}>
            {split.easy.solved} easy · {split.medium.solved} medium · {split.hard.solved} hard
          </dd>
        )}
      </Tile>
      <Tile label="Avg. solve time">
        <dd className={VALUE}>
          {progress.solved > 0 ? formatDuration(progress.averageDurationSec) : '—'}
        </dd>
        <dd className={NOTE}>
          {progress.attempted} {progress.attempted === 1 ? 'challenge' : 'challenges'} attempted
        </dd>
      </Tile>
    </dl>
  );
}
