import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router';
import { getChallenge } from '../api/client.js';
import ChallengeWorkspace from '../components/ChallengeWorkspace.jsx';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

const LINK =
  'text-sky-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none';
const SECONDARY_BUTTON =
  'rounded border border-slate-500 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:text-slate-500';
const ALERT =
  'rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900 focus:outline-none';

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
          setLoad({ key: loadKey, status: 'error', message: 'Izazov nije moguće prikazati.' });
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
          message: error?.message || 'Izazov nije moguće učitati.',
        });
      });
    return () => controller.abort();
  }, [id, loadKey]);

  const current = load.key === loadKey ? load : { status: 'loading' };
  const ready = current.status === 'ready';
  usePageTitle(ready ? current.challenge.title : `Izazov ${id}`);

  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        {ready ? (
          current.challenge.title
        ) : (
          <>
            Izazov <span className="font-mono">{id}</span>
          </>
        )}
      </h1>

      {current.status === 'loading' && (
        <p role="status" className="mt-2 text-slate-700">
          Učitavanje izazova…
        </p>
      )}

      {current.status === 'notFound' && (
        <div role="alert" className={`mt-2 ${ALERT}`}>
          <p>
            <span aria-hidden="true">⚠ </span>
            Izazov ne postoji.
          </p>
          <p className="mt-1">
            <Link to={paths.home} className={LINK}>
              Nazad na izazove
            </Link>
          </p>
        </div>
      )}

      {current.status === 'error' && (
        <div role="alert" className={`mt-2 ${ALERT}`}>
          <p>
            <span aria-hidden="true">⚠ </span>
            {current.message}
          </p>
          <button
            type="button"
            className={`mt-2 ${SECONDARY_BUTTON}`}
            onClick={() => setReloadCount((n) => n + 1)}
          >
            Pokušaj ponovo
          </button>
        </div>
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
