import { Link } from 'react-router';
import { isAuthEnabled } from '../../lib/authConfig.js';
import { paths } from '../../paths.js';
import { FOCUS_RING } from '../layout/focusRing.js';

/** A handle that links to its public profile, or plain text while accounts are switched off. */
export default function HunterName({ handle, className = '' }) {
  if (!isAuthEnabled()) return <span className={className}>{handle}</span>;
  return (
    <Link
      to={paths.profile(handle)}
      className={`rounded hover:text-accent hover:underline ${FOCUS_RING} ${className}`}
    >
      {handle}
    </Link>
  );
}
