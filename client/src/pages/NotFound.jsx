import { Link } from 'react-router';
import { paths } from '../paths.js';

export default function NotFound() {
  return (
    <>
      <h1 tabIndex={-1} className="text-2xl font-bold focus:outline-none">
        Stranica ne postoji
      </h1>
      <p className="mt-2">
        <Link
          to={paths.home}
          className="text-sky-800 underline underline-offset-4 focus-visible:ring-2 focus-visible:ring-sky-700 focus-visible:outline-none"
        >
          Nazad na izazove
        </Link>
      </p>
    </>
  );
}
