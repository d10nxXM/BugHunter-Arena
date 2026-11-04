import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { getChallenges } from '../api/client.js';
import { usePageTitle } from '../hooks/usePageTitle.js';
import { paths } from '../paths.js';

const LANGUAGE_LABEL = { python: 'Python', javascript: 'JavaScript' };

export default function ChallengeList() {
  usePageTitle('Izazovi');
  const [reloadCount, setReloadCount] = useState(0);
  const [load, setLoad] = useState({ key: null });

  useEffect(() => {
    const controller = new AbortController();
    getChallenges({ signal: controller.signal })
      .then((challenges) => {
        if (!Array.isArray(challenges)) {
          setLoad({ key: reloadCount, status: 'error', message: 'Izazove nije moguće prikazati.' });
          return;
        }
        setLoad({ key: reloadCount, status: 'ready', challenges });
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setLoad({
          key: reloadCount,
          status: 'error',
          message: error?.message || 'Izazove nije moguće učitati.',
        });
      });
    return () => controller.abort();
  }, [reloadCount]);

  const current = load.key === reloadCount ? load : { status: 'loading' };

  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Izazovi
      </h1>
      <p className="mt-1 text-slate-700">
        Pronađi grešku u kodu, objasni je, nađi ulaz koji je otkriva i ispravi kod.
      </p>

      {current.status === 'loading' && (
        <p role="status" className="mt-4 text-slate-700">
          Učitavanje izazova…
        </p>
      )}

      {current.status === 'error' && (
        <div
          role="alert"
          className="mt-4 rounded border-l-4 border-red-700 bg-red-50 px-3 py-2 text-red-900"
        >
          <p>
            <span aria-hidden="true">⚠ </span>
            {current.message}
          </p>
          <button
            type="button"
            onClick={() => setReloadCount((n) => n + 1)}
            className="mt-2 rounded border border-slate-500 bg-white px-3 py-2 font-medium text-slate-900 hover:bg-slate-100 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none"
          >
            Pokušaj ponovo
          </button>
        </div>
      )}

      {current.status === 'ready' && current.challenges.length === 0 && (
        <p className="mt-4 text-slate-700">Još nema izazova.</p>
      )}

      {current.status === 'ready' && current.challenges.length > 0 && (
        <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {current.challenges.map((challenge) => (
            <li
              key={challenge.id}
              className="rounded border border-slate-200 bg-white p-4 shadow-sm focus-within:ring-2 focus-within:ring-sky-700"
            >
              <h2 className="text-lg font-semibold">
                <Link
                  to={paths.challenge(challenge.id)}
                  className="text-sky-800 underline-offset-4 hover:underline focus-visible:outline-none"
                >
                  {challenge.title}
                </Link>
              </h2>
              <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-2 text-sm text-slate-700">
                <dt>Jezik:</dt>
                <dd>{LANGUAGE_LABEL[challenge.language] ?? challenge.language}</dd>
                <dt>Težina:</dt>
                <dd>{challenge.difficulty}</dd>
                <dt>Kategorija:</dt>
                <dd>{challenge.bugCategory}</dd>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
