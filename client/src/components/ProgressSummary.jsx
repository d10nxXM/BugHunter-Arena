import { challengeName, formatDuration } from '../lib/progressFormat.js';

/**
 * GET /api/progress statistics.
 * @param {{
 *   progress: {
 *     totalScore: number, solved: number, attempted: number, averageDurationSec: number,
 *     perChallenge: Array<{ challengeId: string, bestScore: number, attempts: number }>,
 *     weakCategories: Array<{ category: string, misses: number }>,
 *   },
 *   titles: Map<string, string>,
 * }} props
 */
export default function ProgressSummary({ progress, titles }) {
  const perChallenge = Array.isArray(progress.perChallenge) ? progress.perChallenge : [];
  const weak = Array.isArray(progress.weakCategories) ? progress.weakCategories : [];

  return (
    <>
      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Stat label="Ukupni bodovi" value={progress.totalScore} />
        <Stat label="Riješeni izazovi" value={progress.solved} />
        <Stat label="Pokušani izazovi" value={progress.attempted} />
        <Stat
          label="Prosječno vrijeme rješavanja"
          value={progress.solved > 0 ? formatDuration(progress.averageDurationSec) : '—'}
        />
      </dl>

      <section aria-labelledby="progress-per-challenge" className="mt-8">
        <h3 id="progress-per-challenge" className="mb-3 text-lg font-semibold">
          Po izazovima
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-sm">
            <caption className="sr-only">Najbolji rezultat i broj pokušaja po izazovu</caption>
            <thead>
              <tr className="border-b border-slate-300 text-slate-700">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Izazov
                </th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">
                  Najbolji rezultat
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Pokušaji
                </th>
              </tr>
            </thead>
            <tbody>
              {perChallenge.map((item) => (
                <tr key={item.challengeId} className="border-b border-slate-200">
                  <th scope="row" className="py-2 pr-4 font-normal">
                    {challengeName(titles, item.challengeId)}
                  </th>
                  <td className="py-2 pr-4 text-right tabular-nums">{item.bestScore} / 100</td>
                  <td className="py-2 text-right tabular-nums">{item.attempts}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="progress-weak" className="mt-8">
        <h3 id="progress-weak" className="mb-3 text-lg font-semibold">
          Kategorije grešaka za vježbu
        </h3>
        {weak.length === 0 ? (
          <p className="text-slate-700">Nema kategorija u kojima često griješiš.</p>
        ) : (
          <ol className="list-decimal space-y-1 pl-6">
            {weak.map((item) => (
              <li key={item.category}>
                {item.category}: {item.misses} {item.misses === 1 ? 'promašaj' : 'promašaja'}
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded border border-slate-300 bg-white p-3">
      <dt className="text-sm text-slate-700">{label}</dt>
      <dd className="text-2xl font-bold tabular-nums">{value}</dd>
    </div>
  );
}
