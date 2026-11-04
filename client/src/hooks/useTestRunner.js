import { createContext, useContext } from 'react';

/**
 * Test runner shared by the whole app, provided by TestRunnerProvider.
 *
 * Interface (stable, ChallengePage depends on it):
 *   { ready: boolean, loadError: string | null, run }
 *   run({ code, functionName, tests: [{ id, args, expected }] })
 *     -> Promise<{ results: [{ id, passed, actual, error }], timedOut: boolean }>
 *
 * Rules for consumers:
 * - Never run tests, submit an attempt or send an evaluation while `ready` is false.
 * - Show `loadError` (Montenegrin) when it is set.
 * - When run() rejects, treat it as "tests did not run": show the error, do not send results.
 *   A rejection never means "the tests failed".
 *
 * Lifecycle notes:
 * - fail() (runner gives up: init failure, worker error, restarts exhausted) is terminal until
 *   the page is reloaded; `loadError` stays set and `ready` never becomes true again.
 * - run() rejects while the runner is not ready (loading, restarting after a timeout, or failed).
 * - Worker error text must never be rendered as HTML: show `loadError` and `error` as plain text.
 *
 * Results: `passed` is decided on the page with lib/compareResults.js (JSON equality, see
 * docs/SCORING.md). `error` is null for a test that ran, "<Type>: <message>" (max 200 chars)
 * when the code raised, or 'timeout'. `actual` is null when there is an error.
 * run() calls are queued and run one at a time; each run's 3 s starts when it is sent.
 *
 * Implementation: components/TestRunnerProvider.jsx (React wrapper), workers/runnerClient.js
 * (worker lifecycle, timeouts, restarts, queue) and workers/testRunner.worker.js (Pyodide).
 *
 * Contract for the provider:
 * - One long-lived module worker, `new Worker(new URL('../workers/testRunner.worker.js',
 *   import.meta.url), { type: 'module' })`, started when the app opens.
 * - Init timeout (~30 s) without { type: 'ready' } -> loadError set, ready stays false.
 * - worker.onerror / onmessageerror -> loadError set, every pending run() settles (rejects).
 * - Each run is limited to 3 s. Over the limit: terminate the worker, resolve
 *   { timedOut: true, results } with error 'timeout' (passed: false, actual: null) for every
 *   test, and start a fresh worker (ready false until it is ready again).
 * - Limit the number of restarts; past it, set loadError instead of restarting forever.
 * - run() while !ready rejects with an Error whose message is Montenegrin.
 * - StrictMode: the effect that starts the worker terminates it in its cleanup.
 * - Memoise the context value (useMemo over ready, loadError and a stable run from useCallback),
 *   so consumers do not re-render or re-run effects on every provider render.
 * - Do not edit vite.config.js (frozen after M1). Monaco comes from the local `monaco-editor`
 *   package through workers/monacoSetup.js (editor worker via a Vite `?worker` import), not
 *   through @monaco-editor/react, whose loader has a public-CDN default.
 * - Security: loadPyodide({ indexURL: '/pyodide/' }) explicitly. Never loadPackage or micropip,
 *   which would fall back to Pyodide's default public CDN.
 * - Monaco: only the Python language and the editor worker. Never feed AI or student text to
 *   Monaco hovers, markers or markdown.
 */
export const TestRunnerContext = createContext(null);

export function useTestRunner() {
  const value = useContext(TestRunnerContext);
  if (value === null) {
    throw new Error('useTestRunner must be used inside <TestRunnerProvider>.');
  }
  return value;
}
