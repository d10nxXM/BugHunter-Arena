import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { ApiError, getProfile } from '../api/client.js';
import ProfileHeader from '../components/profile/ProfileHeader.jsx';
import ProfileStats from '../components/profile/ProfileStats.jsx';
import RankProgress from '../components/profile/RankProgress.jsx';
import RecentSolves from '../components/profile/RecentSolves.jsx';
import SolvedByLanguage from '../components/profile/SolvedByLanguage.jsx';
import Button from '../components/ui/Button.jsx';
import { useAuth } from '../hooks/useAuth.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { isAuthEnabled } from '../lib/authConfig.js';
import { HANDLE_PATTERN } from '../lib/authValidation.js';
import { paths } from '../paths.js';
import AccountPlaceholder from './AccountPlaceholder.jsx';

const H1 = 'font-display text-[34px] font-bold tracking-tight text-heading focus:outline-none';

function isProfile(data) {
  return data !== null && typeof data === 'object' && typeof data.handle === 'string';
}

function NotFoundState() {
  return (
    <div className="flex flex-col items-start gap-4">
      <p className="font-mono text-sm text-subtle">$ whois ./hunter</p>
      <h1 tabIndex={-1} className={H1}>
        Hunter not found
      </h1>
      <p className="text-muted">No hunter has this handle. Check the address and try again.</p>
      <Button to={paths.problems}>Back to problems</Button>
    </div>
  );
}

/**
 * Loads GET /api/profiles/:handle. Returns { status: 'loading' | 'ready' | 'notFound' | 'error',
 * profile, retry }. An invalid handle is 'notFound' without a request.
 */
function useProfile(handle) {
  const valid = HANDLE_PATTERN.test(handle);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState({ key: null, status: 'loading', profile: null });
  const key = `${handle}#${attempt}`;

  useEffect(() => {
    if (!valid) return undefined;
    const controller = new AbortController();
    getProfile(handle, { signal: controller.signal })
      .then((data) => {
        setResult(
          isProfile(data)
            ? { key, status: 'ready', profile: data }
            : { key, status: 'error', profile: null },
        );
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        const notFound =
          error instanceof ApiError && (error.status === 404 || error.status === 400);
        setResult({ key, status: notFound ? 'notFound' : 'error', profile: null });
      });
    return () => controller.abort();
  }, [handle, valid, key]);

  const retry = () => setAttempt((n) => n + 1);
  if (!valid) return { status: 'notFound', profile: null, retry };
  if (result.key !== key) return { status: 'loading', profile: null, retry };
  return { ...result, retry };
}

/** Public, read-only hunter profile at /u/:handle. */
export default function Profile() {
  const { handle: rawHandle = '' } = useParams();
  const handle = rawHandle.toLowerCase();
  usePageTitle(`@${handle}`);
  const { account } = useAuth();
  const { status, profile, retry } = useProfile(handle);

  if (!isAuthEnabled()) return <AccountPlaceholder title="Hunter profile" />;
  if (status === 'notFound') return <NotFoundState />;

  const own = account?.handle === handle;
  const actions = own ? (
    <Button to={paths.problems} size="sm">
      Keep hunting
    </Button>
  ) : null;

  return (
    <div className="flex flex-col gap-7">
      <ProfileHeader
        handle={profile?.handle ?? handle}
        rankName={profile?.rank?.name}
        memberSince={profile?.memberSince}
        actions={actions}
      />
      {status === 'loading' && (
        <p role="status" className="text-muted">
          Loading profile…
        </p>
      )}
      {status === 'error' && (
        <div role="alert" className="flex flex-col items-start gap-3">
          <p className="text-muted">
            <span aria-hidden="true">⚠ </span>
            This profile could not be loaded.
          </p>
          <Button variant="secondary" size="sm" onClick={retry}>
            Try again
          </Button>
        </div>
      )}
      {status === 'ready' && (
        <>
          <ProfileStats
            totalXp={profile.totalXp}
            solved={profile.solved}
            attempted={profile.attempted}
            challengesAvailable={profile.challengesAvailable}
          />
          <div className="flex flex-wrap items-start gap-5">
            <div className="flex min-w-0 flex-[999_1_600px] flex-col gap-5">
              <RecentSolves solves={profile.recentSolves} />
            </div>
            <aside className="flex min-w-0 flex-[1_1_320px] flex-col gap-5">
              <SolvedByLanguage languages={profile.solvedByLanguage} />
              <RankProgress rank={profile.rank} totalXp={profile.totalXp} />
            </aside>
          </div>
        </>
      )}
    </div>
  );
}
