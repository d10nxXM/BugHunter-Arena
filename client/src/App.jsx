import { lazy } from 'react';
import { Route, Routes } from 'react-router';
import Layout from './components/Layout.jsx';
import TestRunnerProvider from './components/TestRunnerProvider.jsx';
import UserProvider from './context/UserProvider.jsx';

const ChallengeList = lazy(() => import('./pages/ChallengeList.jsx'));
const ChallengePage = lazy(() => import('./pages/ChallengePage.jsx'));
const ResultView = lazy(() => import('./pages/ResultView.jsx'));
const Dashboard = lazy(() => import('./pages/Dashboard.jsx'));
const NotFound = lazy(() => import('./pages/NotFound.jsx'));

// Route table. Fixed after M1: M2 workers fill the pages, never this file.
// Suspense and the error boundary live in Layout, so the header stays while a page loads or fails.
export default function App() {
  return (
    <UserProvider>
      <TestRunnerProvider>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<ChallengeList />} />
            <Route path="/challenges/:id" element={<ChallengePage />} />
            <Route path="/challenges/:id/result" element={<ResultView />} />
            <Route path="/progress" element={<Dashboard />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </TestRunnerProvider>
    </UserProvider>
  );
}
