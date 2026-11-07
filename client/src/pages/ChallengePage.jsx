import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getChallenge } from '../api/client.js';
import ChallengeWorkspace from '../components/ChallengeWorkspace.jsx';
import Button from '../components/ui/Button.jsx';
import Notice from '../components/ui/Notice.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

const H1 =
  'font-display text-[30px] font-bold tracking-tight text-heading focus:outline-none sm:text-[34px]';

function isPublicChallenge(data) {
  return (
    data !== null &&
    typeof data === 'object' &&
    typeof data.id === 'string' &&
    typeof data.title === 'string' &&
    typeof data.code === 'string' &&
    typeof data.functionName === 'string' &&
    Array.isArray(data.visibleTests)
  );
}

export default function ChallengePage() {
  const { id } = useParams();
  const [reloadCount, setReloadCount] = useState(0);
  const loadKey = `${id}\n${reloadCount}`;
  const [load, setLoad] = useState({ key: null });

  useEffect(() => {
    const controller = new AbortController();
    getChallenge(id, { signal: controller.signal })
      .then((challenge) => {
        if (!isPublicChallenge(challenge)) {
          setLoad({ key: loadKey, status: 'error', message: 'This challenge cannot be shown.' });
          return;
        }
        setLoad({ key: loadKey, status: 'ready', challenge, startedAt: Date.now() });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        if (error?.status === 404) {
          setLoad({ key: loadKey, status: 'notFound' });
          return;
        }
        setLoad({
          key: loadKey,
          status: 'error',
          message: error?.message || 'The challenge could not be loaded.',
        });
      });
    return () => controller.abort();
  }, [id, loadKey]);

  const current = load.key === loadKey ? load : { status: 'loading' };
  const ready = current.status === 'ready';
  usePageTitle(ready ? current.challenge.title : `Challenge ${id}`);

  return (
    <>
      <div className="mb-5 flex flex-col gap-2">
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[13px] text-subtle">
          <Link
            to={paths.problems}
            className="rounded text-muted hover:text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
          >
            <span aria-hidden="true">← </span>Problems
          </Link>
          <span aria-hidden="true">$ open ./{id}</span>
        </p>
        <h1 tabIndex={-1} className={H1}>
          {ready ? (
            current.challenge.title
          ) : (
            <>
              Challenge <span className="font-mono">{id}</span>
            </>
          )}
        </h1>
      </div>

      {current.status === 'loading' && (
        <p role="status" className="text-muted">
          Loading challenge…
        </p>
      )}

      {current.status === 'notFound' && (
        <Notice role="alert" tone="danger" className="max-w-xl">
          <p>This challenge does not exist.</p>
          <p>
            <Link
              to={paths.problems}
              className="font-medium text-heading underline underline-offset-4 hover:text-accent"
            >
              Back to problems
            </Link>
          </p>
        </Notice>
      )}

      {current.status === 'error' && (
        <Notice role="alert" tone="danger" className="max-w-xl">
          <p>{current.message}</p>
          <div>
            <Button variant="secondary" size="sm" onClick={() => setReloadCount((n) => n + 1)}>
              Try again
            </Button>
          </div>
        </Notice>
      )}

      {ready && (
        <ChallengeWorkspace
          key={loadKey}
          challenge={current.challenge}
          startedAt={current.startedAt}
        />
      )}
    </>
  );
}
