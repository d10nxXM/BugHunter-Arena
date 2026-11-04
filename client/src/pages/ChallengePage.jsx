import { useParams } from 'react-router';
import { usePageTitle } from '../hooks/usePageTitle.js';

// M1 stub. Worker E builds the challenge screen here.
export default function ChallengePage() {
  const { id } = useParams();
  usePageTitle(`Izazov ${id}`);
  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Izazov <span className="font-mono">{id}</span>
      </h1>
      <p className="mt-2 text-slate-700">Stranica je u izradi.</p>
    </>
  );
}
