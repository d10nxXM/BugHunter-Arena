import { Link } from 'react-router';
import { languageLabel } from '../../lib/labels.js';
import { relativeDay } from '../../lib/profileFormat.js';
import { paths } from '../../paths.js';
import DifficultyBadge from '../ui/DifficultyBadge.jsx';

/** The latest solved challenges, newest first (the server sends at most 10). */
export default function RecentSolves({ solves }) {
  const list = Array.isArray(solves) ? solves : [];
  return (
    <section
      aria-labelledby="recent-solves-heading"
      className="overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <h2
        id="recent-solves-heading"
        className="border-b border-border px-6 py-5 font-display text-[19px] font-semibold text-heading"
      >
        Recent solves
      </h2>
      {list.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted">No solved challenges yet.</p>
      ) : (
        <ul>
          {list.map((solve) => (
            <li
              key={solve.challengeId}
              className="flex flex-wrap items-center gap-x-5 gap-y-2.5 border-b border-surface-2 px-6 py-3.5 last:border-b-0"
            >
              <span aria-hidden="true" className="text-accent">
                ✓
              </span>
              <Link
                to={paths.challenge(solve.challengeId)}
                className="min-w-0 flex-[1_1_220px] rounded font-semibold text-heading underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {solve.title || solve.challengeId}
              </Link>
              <span className="w-24 font-mono text-[13px] text-muted">
                {languageLabel(solve.language)}
              </span>
              <DifficultyBadge difficulty={solve.difficulty} plain className="w-18 text-sm" />
              {Number.isFinite(solve.bestScore) && (
                <span className="w-20 font-mono text-[13px] text-muted">{solve.bestScore} pts</span>
              )}
              <span className="w-24 text-right text-[13px] text-subtle">
                <span className="sr-only">Solved </span>
                {relativeDay(solve.solvedAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
