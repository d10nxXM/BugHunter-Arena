import { lazy } from 'react';
import { Navigate, Route, Routes } from 'react-router';
import Layout, { PageContainer } from './components/Layout.jsx';
import TestRunnerProvider from './components/TestRunnerProvider.jsx';
import AuthProvider from './context/AuthProvider.jsx';
import UserProvider from './context/UserProvider.jsx';
import ProfileRedirect from './pages/ProfileRedirect.jsx';
import { paths } from './paths.js';

const Landing = lazy(() => import('./pages/Landing.jsx'));
const ChallengeList = lazy(() => import('./pages/ChallengeList.jsx'));
const ChallengePage = lazy(() => import('./pages/ChallengePage.jsx'));
const ResultView = lazy(() => import('./pages/ResultView.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const Login = lazy(() => import('./pages/Login.jsx'));
const Signup = lazy(() => import('./pages/Signup.jsx'));
const Profile = lazy(() => import('./pages/Profile.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Route table. Suspense and the error boundary live in Layout, so the header stays while a page
// loads or fails. The landing page is full-bleed; every other page sits in PageContainer.
export default function App() {
  return (
    <UserProvider>
      <AuthProvider>
        <TestRunnerProvider>
          <Routes>
            <Route element={<Layout />}>
              <Route path={paths.home} element={<Landing />} />
              <Route element={<PageContainer />}>
                <Route path="/challenges/:id" element={<ChallengePage />} />
                <Route path="/challenges/:id/result" element={<ResultView />} />
                <Route path={paths.dashboard} element={<Dashboard />} />
                <Route path={paths.problems} element={<ChallengeList />} />
                <Route path={paths.login} element={<Login />} />
                <Route path={paths.signup} element={<Signup />} />
                <Route path="/u/:handle" element={<Profile />} />
                <Route path="*" element={<NotFound />} />
              </Route>
              <Route path={paths.ownProfile} element={<ProfileRedirect />} />
              <Route path="/progress" element={<Navigate to={paths.dashboard} replace />} />
            </Route>
          </Routes>
        </TestRunnerProvider>
      </AuthProvider>
    </UserProvider>
  );
}
