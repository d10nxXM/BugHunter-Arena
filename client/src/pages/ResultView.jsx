import { usePageTitle } from '../hooks/usePageTitle.js';

// M1 stub. Worker F builds the result screen here. It reads a ResultState (src/paths.js) from
// router state; a direct visit has none and shows "Rezultat nije dostupan." with a link back.
export default function ResultView() {
  usePageTitle('Rezultat');
  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Rezultat
      </h1>
      <p className="mt-2 text-slate-700">Stranica je u izradi.</p>
    </>
  );
}
