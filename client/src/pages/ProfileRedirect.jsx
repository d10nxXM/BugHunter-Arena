import { Navigate } from 'react-router';
import { useAuth } from '../hooks/useAuth.js';
import { paths } from '../paths.js';

/** /profile: your own profile when logged in, otherwise the login page (and back here after). */
export default function ProfileRedirect() {
  const { account } = useAuth();
  if (account) return <Navigate to={paths.profile(account.handle)} replace />;
  return <Navigate to={paths.login} replace state={{ from: paths.ownProfile }} />;
}
