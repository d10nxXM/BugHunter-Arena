import { Link } from 'react-router';
import { languageLabel } from '../../lib/labels.js';
import { MAX_CHALLENGE_XP } from '../../lib/xp.js';
import { paths } from '../../paths.js';
import DifficultyBadge from '../ui/DifficultyBadge.jsx';

/** "Recommended for you": unsolved challenges from recommendations() in src/lib/dashboard.js. */
export default function RecommendedList({ challenges }) {
  return (
    <section
      aria-labelledby="recommended-heading"
      className="overflow-hidden rounded-[14px] border border-border bg-surface"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-6 py-5">
        <h2
          id="recommended-heading"
          className="font-display text-[19px] font-semibold text-heading"
        >
          Recommended for you
        </h2>
        <Link
          to={paths.problems}
          className="rounded text-sm font-semibold text-accent hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        >
          All problems <span aria-hidden="true">→</span>
        </Link>
      </div>
      {challenges.length === 0 ? (
        <p className="px-6 py-5 text-sm text-muted">Nothing left to recommend. Nice hunting.</p>
      ) : (
        <ul>
          {challenges.map((c) => (
            <li key={c.id} className="border-b border-surface-2 last:border-b-0">
              <Link
                to={paths.challenge(c.id)}
                className="flex flex-wrap items-center gap-x-5 gap-y-2 px-6 py-4 hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 flex-[1_1_200px] font-semibold text-heading">
                  {c.title || c.id}
                </span>
                <span className="w-24 font-mono text-[13px] text-muted">
                  {languageLabel(c.language)}
                </span>
                <span className="w-44 text-sm text-muted">{c.bugCategory}</span>
                <DifficultyBadge difficulty={c.difficulty} plain className="w-16 text-sm" />
                <span className="w-24 text-right font-mono text-sm text-text">
                  up to {MAX_CHALLENGE_XP} XP
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
