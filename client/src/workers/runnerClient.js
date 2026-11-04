import { compareResults } from '../lib/compareResults.js';

/**
 * Page side of the test runner: owns the long-lived worker, its init timeout, the 3 s run limit,
 * restarts and the run queue. React-free, so TestRunnerProvider stays a thin wrapper.
 * The full contract is the doc comment in src/hooks/useTestRunner.js.
 */
export const RUN_TIMEOUT_MS = 3000;
export const INIT_TIMEOUT_MS = 30000;
// Restarts in a row (after a timeout or a broken run) without one run finishing normally.
export const MAX_CONSECUTIVE_RESTARTS = 5;

export const RUNNER_UNAVAILABLE = 'Pokretanje testova nije dostupno u ovom pregledaču.';
export const RUNNER_NOT_READY = 'Python okruženje se još učitava. Pokušaj ponovo za par sekundi.';
export const LOAD_FAILED =
  'Python okruženje nije moguće učitati. Osvježi stranicu i pokušaj ponovo.';
export const LOAD_TIMEOUT =
  'Učitavanje Python okruženja traje predugo. Osvježi stranicu i pokušaj ponovo.';
export const RUNNER_CRASHED =
  'Python okruženje je prestalo da radi. Osvježi stranicu i pokušaj ponovo.';
export const TOO_MANY_RESTARTS =
  'Python okruženje je ponovo pokretano previše puta. Osvježi stranicu.';
export const RUN_FAILED = 'Testovi nisu pokrenuti zbog greške u Python okruženju. Pokušaj ponovo.';
export const BAD_REQUEST = 'Testovi nisu pokrenuti: neispravan zahtjev.';
export const RUNNER_STOPPED = 'Pokretanje testova je prekinuto.';

export const TIMEOUT_ERROR = 'timeout';

function defaultCreateWorker() {
  return new Worker(new URL('./testRunner.worker.js', import.meta.url), { type: 'module' });
}

function isValidPayload(payload) {
  return (
    payload !== null &&
    typeof payload === 'object' &&
    typeof payload.code === 'string' &&
    typeof payload.functionName === 'string' &&
    payload.functionName.length > 0 &&
    Array.isArray(payload.tests) &&
    payload.tests.every(
      (test) =>
        test !== null &&
        typeof test === 'object' &&
        (typeof test.id === 'string' || typeof test.id === 'number') &&
        (test.args === undefined || Array.isArray(test.args)),
    )
  );
}

function timeoutResults(tests) {
  return tests.map((test) => ({ id: test.id, passed: false, actual: null, error: TIMEOUT_ERROR }));
}

/**
 * Builds the public results from the worker's answer. `passed` is decided here, never in the
 * worker. Returns null when the answer does not match the tests that were sent.
 */
function buildResults(tests, workerResults) {
  if (!Array.isArray(workerResults) || workerResults.length !== tests.length) return null;
  const results = [];
  for (let i = 0; i < tests.length; i += 1) {
    const test = tests[i];
    const item = workerResults[i];
    if (!item || item.id !== test.id) return null;
    if (item.ok === true) {
      results.push({
        id: test.id,
        passed: compareResults(item.actual, test.expected),
        actual: item.actual,
        error: null,
      });
    } else {
      results.push({
        id: test.id,
        passed: false,
        actual: null,
        error: typeof item.error === 'string' && item.error ? item.error.slice(0, 200) : 'Error',
      });
    }
  }
  return results;
}

/**
 * createRunnerClient({ onState, createWorker? }) -> { run, dispose }
 * onState({ ready, loadError }) is called on every change.
 */
export function createRunnerClient({ onState, createWorker = defaultCreateWorker }) {
  let worker = null;
  let ready = false;
  let loadError = null;
  let disposed = false;
  let initTimer = null;
  let restarts = 0;
  let nextRunId = 1;
  let current = null; // { runId, tests, resolve, reject, timer }
  const queue = [];

  function emit() {
    if (!disposed) onState({ ready, loadError });
  }

  function setState(next) {
    const nextReady = next.ready ?? ready;
    const nextError = next.loadError !== undefined ? next.loadError : loadError;
    if (nextReady === ready && nextError === loadError) return;
    ready = nextReady;
    loadError = nextError;
    emit();
  }

  function stopWorker() {
    clearTimeout(initTimer);
    initTimer = null;
    if (worker) {
      worker.onmessage = null;
      worker.onerror = null;
      worker.onmessageerror = null;
      worker.terminate();
      worker = null;
    }
  }

  function rejectAll(message) {
    if (current) {
      clearTimeout(current.timer);
      current.reject(new Error(message));
      current = null;
    }
    while (queue.length > 0) queue.shift().reject(new Error(message));
  }

  function fail(message) {
    stopWorker();
    setState({ ready: false, loadError: message });
    rejectAll(message);
  }

  function restart() {
    stopWorker();
    restarts += 1;
    if (restarts > MAX_CONSECUTIVE_RESTARTS) {
      fail(TOO_MANY_RESTARTS);
      return;
    }
    start();
  }

  function handleMessage(source, event) {
    if (source !== worker) return; // a stale message from a terminated worker
    const data = event.data;
    if (!data || typeof data !== 'object') return;

    if (data.type === 'ready') {
      clearTimeout(initTimer);
      initTimer = null;
      setState({ ready: true });
      pump();
      return;
    }
    if (data.type === 'init-error') {
      fail(LOAD_FAILED);
      return;
    }
    if (!current || data.runId !== current.runId) return;

    const job = current;
    if (data.type === 'result') {
      const results = buildResults(job.tests, data.results);
      clearTimeout(job.timer);
      current = null;
      if (results === null) {
        job.reject(new Error(RUN_FAILED));
      } else {
        restarts = 0;
        job.resolve({ results, timedOut: false });
      }
      pump();
      return;
    }
    if (data.type === 'run-error') {
      // The harness itself failed, so Pyodide may be unusable: replace the worker.
      clearTimeout(job.timer);
      current = null;
      job.reject(new Error(RUN_FAILED));
      setState({ ready: false });
      restart();
    }
  }

  function start() {
    if (disposed) return;
    setState({ ready: false });
    let created;
    try {
      created = createWorker();
    } catch {
      fail(RUNNER_UNAVAILABLE);
      return;
    }
    worker = created;
    created.onmessage = (event) => handleMessage(created, event);
    created.onerror = (event) => {
      if (created !== worker) return;
      event?.preventDefault?.();
      fail(RUNNER_CRASHED);
    };
    created.onmessageerror = () => {
      if (created !== worker) return;
      fail(RUNNER_CRASHED);
    };
    initTimer = setTimeout(() => {
      if (created !== worker || ready) return;
      fail(LOAD_TIMEOUT);
    }, INIT_TIMEOUT_MS);
  }

  function onRunTimeout(job) {
    if (current !== job) return;
    current = null;
    job.resolve({ results: timeoutResults(job.tests), timedOut: true });
    setState({ ready: false });
    restart(); // terminate the stuck worker and load a fresh Pyodide; queued runs wait for it
  }

  function pump() {
    if (current || !ready || !worker || queue.length === 0) return;
    const job = queue.shift();
    const runId = nextRunId;
    nextRunId += 1;
    job.runId = runId;
    current = job;
    try {
      worker.postMessage({
        type: 'run',
        runId,
        code: job.code,
        functionName: job.functionName,
        tests: job.tests.map((test) => ({ id: test.id, args: test.args ?? [] })),
      });
    } catch {
      current = null;
      job.reject(new Error(BAD_REQUEST));
      pump();
      return;
    }
    job.timer = setTimeout(() => onRunTimeout(job), RUN_TIMEOUT_MS);
  }

  function run(payload) {
    if (disposed) return Promise.reject(new Error(RUNNER_STOPPED));
    if (loadError) return Promise.reject(new Error(loadError));
    if (!ready) return Promise.reject(new Error(RUNNER_NOT_READY));
    if (!isValidPayload(payload)) return Promise.reject(new Error(BAD_REQUEST));
    return new Promise((resolve, reject) => {
      queue.push({
        code: payload.code,
        functionName: payload.functionName,
        tests: payload.tests.map((test) => ({
          id: test.id,
          args: test.args,
          expected: test.expected,
        })),
        resolve,
        reject,
        timer: null,
      });
      pump();
    });
  }

  function dispose() {
    if (disposed) return;
    stopWorker();
    rejectAll(RUNNER_STOPPED);
    disposed = true;
  }

  emit(); // reset the consumer's state, e.g. after a StrictMode remount
  start();
  return { run, dispose };
}
