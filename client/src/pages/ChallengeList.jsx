import { usePageTitle } from '../hooks/usePageTitle.js';

// M1 stub. Worker E builds the challenge list here.
export default function ChallengeList() {
  usePageTitle('Izazovi');
  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Izazovi
      </h1>
      <p className="mt-2 text-slate-700">Stranica je u izradi.</p>
    </>
  );
}
