/**
 * The test-runner worker: the only place in the app where student code runs (CLAUDE.md hard rule 1).
 *
 * Protocol (the page side is src/workers/runnerClient.js):
 *   worker -> page  { type: 'ready' }                         Pyodide loaded, harness defined
 *   worker -> page  { type: 'init-error', message }           Pyodide could not be loaded
 *   page -> worker  { type: 'run', runId, code, functionName, tests: [{ id, args }] }
 *   worker -> page  { type: 'result', runId, results: [{ id, ok, actual, error }] }
 *   worker -> page  { type: 'run-error', runId, message }     the harness itself failed
 *
 * The worker never sees `expected` and never decides `passed`: the page compares results with
 * lib/compareResults.js, outside the reach of student code. The 3 s limit is enforced by the
 * page, which terminates this worker on timeout.
 *
 * No CDN: Pyodide is imported at runtime from /pyodide/ (public/, copied by `npm run
 * pyodide:copy`) instead of bundling the `pyodide` npm module, whose loader contains a public-CDN
 * default URL. loadPackage and micropip are never used.
 */
const PYODIDE_MODULE_URL = '/pyodide/pyodide.mjs';
const PYODIDE_INDEX_URL = '/pyodide/';

// Captured before any student code runs, so rebinding self.postMessage from Python cannot
// intercept the results.
const post = self.postMessage.bind(self);

// Python harness. Each run executes the student's code in a fresh namespace, runs every test in
// its own try/except and returns the results as a JSON string. Each `actual` is itself a JSON
// string, produced only from strict JSON values (None, bool, int, finite float, str, list,
// tuple, dict with str keys), so the page never receives NaN, sets or other non-JSON values.
const HARNESS = String.raw`
import builtins as _builtins
import json as _json

_bh_loads = _json.loads
_bh_dumps = _json.dumps
_BH_MAX_DEPTH = 100
_BH_MAX_ERROR = 200


class _BhNotJson(Exception):
    pass


def _bh_check_json(value, depth=0):
    if depth > _BH_MAX_DEPTH:
        raise _BhNotJson("too deep")
    if value is None or isinstance(value, (bool, str)):
        return value
    if isinstance(value, int):
        return value
    if isinstance(value, float):
        if value != value or value in (float("inf"), float("-inf")):
            raise _BhNotJson("float")
        return value
    if isinstance(value, (list, tuple)):
        return [_bh_check_json(item, depth + 1) for item in value]
    if isinstance(value, dict):
        checked = {}
        for key, item in value.items():
            if not isinstance(key, str):
                raise _BhNotJson("key")
            checked[key] = _bh_check_json(item, depth + 1)
        return checked
    raise _BhNotJson(type(value).__name__)


def _bh_format_error(exc):
    try:
        message = str(exc)
    except BaseException:
        message = ""
    text = type(exc).__name__ + (": " + message if message else "")
    return text[:_BH_MAX_ERROR]


def _bughunter_run(code, function_name, tests_json):
    tests = _bh_loads(tests_json)
    namespace = {"__name__": "__student__", "__builtins__": _builtins}
    setup_error = None
    function = None
    try:
        exec(compile(code, "<kod>", "exec", dont_inherit=True), namespace)
    except BaseException as exc:
        setup_error = _bh_format_error(exc)
    if setup_error is None:
        function = namespace.get(function_name)
        if function is None:
            setup_error = ("NameError: funkcija '" + function_name + "' nije definisana")[:_BH_MAX_ERROR]
        elif not callable(function):
            setup_error = ("TypeError: '" + function_name + "' nije funkcija")[:_BH_MAX_ERROR]

    results = []
    for test in tests:
        test_id = test.get("id")
        if setup_error is not None:
            results.append({"id": test_id, "ok": False, "actual": None, "error": setup_error})
            continue
        try:
            value = function(*test.get("args", []))
        except BaseException as exc:
            results.append({"id": test_id, "ok": False, "actual": None, "error": _bh_format_error(exc)})
            continue
        try:
            encoded = _bh_dumps(_bh_check_json(value), allow_nan=False)
        except BaseException:
            try:
                type_name = type(value).__name__
            except BaseException:
                type_name = "?"
            error = ("TypeError: rezultat tipa '" + type_name + "' nije JSON vrijednost")[:_BH_MAX_ERROR]
            results.append({"id": test_id, "ok": False, "actual": None, "error": error})
            continue
        results.append({"id": test_id, "ok": True, "actual": encoded, "error": None})
    return _bh_dumps(results)
`;

let runHarness = null;

function describe(error) {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 200);
  return String(error).slice(0, 200);
}

async function init() {
  try {
    // A full URL: Vite's dev server would otherwise add `?import` to a root-relative path and
    // refuse to serve a public/ file as a module.
    const moduleUrl = new URL(PYODIDE_MODULE_URL, self.location.origin).href;
    const { loadPyodide } = await import(/* @vite-ignore */ moduleUrl);
    const pyodide = await loadPyodide({
      indexURL: PYODIDE_INDEX_URL,
      // Student print() output is not shown anywhere; keep it out of the console.
      stdout: () => {},
      stderr: () => {},
    });
    pyodide.runPython(HARNESS);
    runHarness = pyodide.globals.get('_bughunter_run');
    post({ type: 'ready' });
  } catch (error) {
    post({ type: 'init-error', message: describe(error) });
  }
}

function handleRun({ runId, code, functionName, tests }) {
  if (!runHarness) {
    post({ type: 'run-error', runId, message: 'Pyodide is not loaded' });
    return;
  }
  try {
    const testsJson = JSON.stringify(tests.map((test) => ({ id: test.id, args: test.args ?? [] })));
    const raw = JSON.parse(runHarness(String(code), String(functionName), testsJson));
    const results = raw.map((item) => ({
      id: item.id,
      ok: item.ok === true,
      actual: item.ok === true ? JSON.parse(item.actual) : null,
      error: item.ok === true ? null : String(item.error ?? 'Error'),
    }));
    post({ type: 'result', runId, results });
  } catch (error) {
    post({ type: 'run-error', runId, message: describe(error) });
  }
}

self.onmessage = (event) => {
  const data = event.data;
  if (data && data.type === 'run') handleRun(data);
};

init();
