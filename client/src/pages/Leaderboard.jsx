import { Link } from 'react-router';
import { FOCUS_RING } from '../components/layout/focusRing.js';
import LeaderboardTable from '../components/leaderboard/LeaderboardTable.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { useLeaderboard } from '../hooks/useLeaderboard.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isAuthEnabled } from '../lib/authConfig.js';
import { LEADERBOARD_TOP } from '../lib/leaderboard.js';
import { paths } from '../paths.js';

const NUMBER = new Intl.NumberFormat('en-US');
const LINK = `rounded text-accent underline-offset-4 hover:underline ${FOCUS_RING}`;

// Text of the page's one persistent live region (an empty string announces nothing).
const STATUS_TEXT = {
  loading: 'Loading the leaderboard…',
  ready: 'Leaderboard loaded.',
  error: '',
};

/** One line about where the logged-in account stands, or a sign-up nudge for guests. */
function OwnStanding({ account, data }) {
  if (!isAuthEnabled()) return null;
  if (!account) {
    return (
      <p className="text-muted">
        Guests are not ranked.{' '}
        <Link to={paths.signup} className={LINK}>
          Create an account
        </Link>{' '}
        to get on the board.
      </p>
    );
  }
  const own = data.entries.find((e) => e.handle === account.handle);
  if (own) {
    return (
      <p className="text-muted">
        You are <strong className="text-heading">#{NUMBER.format(own.position)}</strong> of{' '}
        {NUMBER.format(data.total)}.
      </p>
    );
  }
  // True whether the account ranks lower or has no XP yet; the page does not know which.
  if (data.total > data.entries.length) {
    return <p className="text-muted">You are not in the top {data.entries.length}.</p>;
  }
  return <p className="text-muted">Solve a challenge to get on the board.</p>;
}

/** Public leaderboard at /leaderboard: accounts ranked by XP (docs/SCORING.md, "Leaderboard"). */
export default function Leaderboard() {
  usePageTitle('Leaderboard');
  const { account } = useAuth();
  const { status, data, retry } = useLeaderboard(LEADERBOARD_TOP);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-1.5">
        <p aria-hidden="true" className="font-mono text-[13px] text-subtle">
          $ sort --by=xp ./hunters
        </p>
        <h1
          tabIndex={-1}
          className="font-display text-[30px] font-bold tracking-tight text-heading focus:outline-none sm:text-[34px]"
        >
          Leaderboard
        </h1>
        <p className="text-muted">
          XP is the score of your first solve of each challenge. Retakes never add XP.
        </p>
      </div>

      <p role="status" className={status === 'loading' ? 'text-muted' : 'sr-only'}>
        {STATUS_TEXT[status]}
      </p>
      {status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-muted">
            <span aria-hidden="true">⚠ </span>
            The leaderboard could not be loaded.
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {status === 'ready' && (
        <>
          <OwnStanding account={account} data={data} />
          {data.entries.length > 0 ? (
            // Scrolls sideways on phones, so it must be focusable to scroll by keyboard.
            <div
              role="region"
              aria-label="Leaderboard table"
              tabIndex={0}
              className={`overflow-x-auto rounded-[14px] border border-border bg-surface ${FOCUS_RING}`}
            >
              <LeaderboardTable entries={data.entries} ownHandle={account?.handle ?? null} />
            </div>
          ) : (
            <div className="flex flex-col items-start gap-3 rounded-[14px] border border-border bg-surface px-6 py-10">
              <p className="text-muted">No hunter has solved a challenge yet.</p>
              <Button to={paths.problems}>Be the first</Button>
            </div>
          )}
          <p className="font-mono text-xs text-subtle">Updates about once a minute.</p>
        </>
      )}
    </div>
  );
}
