/**
 * The test-runner worker: the only place in the app where student code runs (CLAUDE.md hard rule 1).
 *
 * Protocol (the page side is src/workers/runnerClient.js). The page's first and only message on
 * the worker itself is { type: 'init', port }, which transfers one end of a MessageChannel.
 * Everything after that goes over that private port, which lives only in this module's closure:
 *   worker -> page  { type: 'ready' }                         Pyodide loaded, harness defined
 *   worker -> page  { type: 'init-error', message }           Pyodide could not be loaded
 *   page -> worker  { type: 'run', runId, code, functionName, tests: [{ id, args }] }
 *   worker -> page  { type: 'result', runId, results: [{ id, ok, actual, error }] }
 *   worker -> page  { type: 'run-error', runId, message }     the run crashed the runtime
 *
 * The worker never sees `expected` and never decides `passed`: the page compares results with
 * lib/compareResults.js. The 3 s limit is enforced by the page, which terminates this worker.
 *
 * No CDN: Pyodide is imported at runtime from /pyodide/ (public/, copied by `npm run
 * pyodide:copy`) instead of bundling the `pyodide` npm module, whose loader contains a public-CDN
 * default URL. indexURL and packageBaseUrl are both local, and loadPackage and micropip are
 * never used.
 *
 * Isolation is practice-grade (security.md: browser results are trusted only for practice).
 * What it does: a private result port, a crypto-random runId per run, harness names bound in a
 * closure, and builtins/sys/sys.modules restored after every run (see harness.js).
 * Known gaps, acceptable for practice use:
 * - Student Python can reach this worker's JS globals through Pyodide's `js` module, for
 *   example to call self.postMessage. The page ignores anything that is not on the private
 *   port, but code that also guessed the runId and found the port could forge results; the port
 *   is not reachable from globals, and the runId is random.
 * - Attributes changed on stdlib modules that were already imported (e.g. math.pi = 3) and
 *   objects reachable through the garbage collector are not restored between runs.
 * - The student owns the browser and can change any of this with dev tools anyway.
 */
import { HARNESS, HARNESS_CLEANUP, HARNESS_ENTRY, callHarness } from './harness.js';

const PYODIDE_PATH = '/pyodide/';

let port = null;
let entry = null;

function describe(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 200);
  return String(error).slice(0, 200);
}

function send(message) {
  port.postMessage(message);
}

async function loadRuntime() {
  try {
    // Full URLs: Vite's dev server would otherwise add `?import` to a root-relative path and
    // refuse to serve a public/ file as a module. packageBaseUrl also replaces Pyodide's CDN
    // default (cdnUrl).
    const baseUrl = new URL(PYODIDE_PATH, self.location.origin).href;
    const { loadPyodide } = await import(/* @vite-ignore */ `${baseUrl}pyodide.mjs`);
    const pyodide = await loadPyodide({
      indexURL: baseUrl,
      packageBaseUrl: baseUrl,
      // Student print() output is not shown anywhere; keep it out of the console.
      stdout: () => {},
      stderr: () => {},
    });
    pyodide.runPython(HARNESS);
    entry = pyodide.globals.get(HARNESS_ENTRY);
    pyodide.runPython(HARNESS_CLEANUP);
    send({ type: 'ready' });
  } catch (error) {
    send({ type: 'init-error', message: describe(error) });
  }
}

function handleRun(data) {
  const { runId } = data;
  if (!entry) {
    send({ type: 'run-error', runId, message: 'Pyodide is not loaded' });
    return;
  }
  try {
    send({ type: 'result', runId, results: callHarness(entry, data) });
  } catch (error) {
    send({ type: 'run-error', runId, message: describe(error) });
  }
}

self.onmessage = (event) => {
  const data = event.data;
  if (port || !data || data.type !== 'init' || !data.port) return;
  // Take the port once, before any student code runs, and stop listening on the worker itself.
  port = data.port;
  self.onmessage = null;
  port.onmessage = (portEvent) => {
    const message = portEvent.data;
    if (message && message.type === 'run') handleRun(message);
  };
  loadRuntime();
};
