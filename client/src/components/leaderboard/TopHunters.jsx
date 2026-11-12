import { initials } from '../../lib/profileFormat.js';
import { paths } from '../../paths.js';
import Button from '../ui/Button.jsx';
import HunterName from './HunterName.jsx';
import { positionStyle } from './positionStyle.js';

const NUMBER = new Intl.NumberFormat('en-US');

/**
 * "Top hunters" card from the landing mockup. `state` is the useLeaderboard result.
 * Shows an honest empty state instead of placeholder names.
 */
export default function TopHunters({ state, headingLevel: Heading = 'h3' }) {
  const entries = state.status === 'ready' ? state.data.entries : [];
  return (
    <section
      aria-labelledby="top-hunters-heading"
      className="min-w-0 overflow-hidden rounded-[14px] border border-border-strong bg-surface"
    >
      <div className="flex items-center justify-between border-b border-border px-5.5 py-5">
        <Heading
          id="top-hunters-heading"
          className="font-display text-lg font-semibold text-heading"
        >
          Top hunters
        </Heading>
        <span className="font-mono text-xs text-subtle">all_time</span>
      </div>
      {/* One persistent live region, so the loading text is announced. */}
      <p
        role="status"
        className={state.status === 'loading' ? 'px-5.5 py-5 text-muted' : 'sr-only'}
      >
        {state.status === 'loading' ? 'Loading the leaderboard…' : ''}
      </p>
      {state.status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3 px-5.5 py-5">
          <p className="text-muted">
            <span aria-hidden="true">⚠ </span>
            The leaderboard could not be loaded.
          </p>
          <Button variant="secondary" size="sm" onClick={state.retry}>
            Try again
          </Button>
        </div>
      )}
      {state.status === 'ready' && entries.length === 0 && (
        <p className="px-5.5 py-5 text-muted">
          No hunter has solved a challenge yet. Be the first on the board.
        </p>
      )}
      {entries.length > 0 && (
        <ol className="py-2">
          {entries.map((entry) => {
            const style = positionStyle(entry.position);
            return (
              <li key={entry.handle} className="flex items-center gap-3.5 px-5.5 py-3">
                <span className={`w-6 font-mono font-bold ${style.text}`}>
                  <span className="sr-only">Position </span>
                  {entry.position}
                </span>
                <span
                  aria-hidden="true"
                  className={`flex size-8.5 shrink-0 items-center justify-center rounded-lg text-[13px] font-bold ${style.avatar}`}
                >
                  {initials(entry.handle)}
                </span>
                <HunterName
                  handle={entry.handle}
                  className="min-w-0 flex-1 truncate font-semibold text-heading"
                />
                <span className="font-mono text-sm whitespace-nowrap text-text">
                  {NUMBER.format(entry.totalXp)} XP
                </span>
              </li>
            );
          })}
        </ol>
      )}
      <div className="border-t border-border px-5.5 py-4">
        <Button to={paths.leaderboard} variant="ghost" size="sm">
          Full leaderboard →
        </Button>
      </div>
    </section>
  );
}
