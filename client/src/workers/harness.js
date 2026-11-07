/**
 * The Python harness that runs student code inside Pyodide, plus the JS glue that turns its
 * output into worker results. Shared by testRunner.worker.js and the Node-side harness test.
 *
 * Isolation per run (practice-grade, see the header of testRunner.worker.js for the gaps):
 * - Student code runs in a fresh namespace with its own copy of the builtins dict.
 * - Every name the harness uses (isinstance, str, json functions, exception types, its own
 *   helpers) is a closure variable of a factory, so rebinding builtins or module globals during
 *   a run cannot change how the harness checks or reports results.
 * - After every run (in `finally`) the harness restores builtins.__dict__, sys.__dict__, the
 *   contents of sys.path / sys.meta_path / sys.path_hooks, the recursion limit, trace and
 *   profile hooks, and sys.modules (modules imported by the run are dropped, replaced ones put
 *   back).
 * - The factory and the entry point are deleted from __main__ once the JS side holds the entry.
 */
export const HARNESS_ENTRY = '_bughunter_run';
export const MAX_ERROR_LENGTH = 200;
// A test result whose JSON encoding is longer than this is reported as an error, not returned.
export const MAX_ACTUAL_LENGTH = 100000;

export const HARNESS = String.raw`
def _bh_make():
    import builtins
    import json
    import sys

    _isinstance = isinstance
    _type = type
    _str = str
    _int = int
    _float = float
    _bool = bool
    _list = list
    _tuple = tuple
    _dict = dict
    _len = len
    _callable = callable
    _compile = compile
    _exec = exec
    _BaseException = BaseException
    _Exception = Exception
    _loads = json.loads
    _dumps = json.dumps
    _getrecursionlimit = sys.getrecursionlimit
    _setrecursionlimit = sys.setrecursionlimit
    _settrace = sys.settrace
    _setprofile = sys.setprofile
    _builtins_dict = builtins.__dict__
    _sys_dict = sys.__dict__
    _modules = sys.modules
    _MAX_DEPTH = 100
    _MAX_ERROR = ${MAX_ERROR_LENGTH}
    _MAX_ACTUAL = ${MAX_ACTUAL_LENGTH}
    _MAX_SAFE_INT = 2 ** 53 - 1
    _INF = _float("inf")

    _builtins_snapshot = _dict(_builtins_dict)
    _sys_snapshot = _dict(_sys_dict)
    _modules_snapshot = _dict(_modules)
    _recursion_limit = _getrecursionlimit()
    _list_snapshots = [
        (sys.path, _list(sys.path)),
        (sys.meta_path, _list(sys.meta_path)),
        (sys.path_hooks, _list(sys.path_hooks)),
    ]

    class NotJson(_Exception):
        pass

    def restore_dict(target, snapshot):
        for key in _list(target.keys()):
            if key not in snapshot:
                del target[key]
        for key, value in snapshot.items():
            if target.get(key, snapshot) is not value:
                target[key] = value

    def restore():
        _settrace(None)
        _setprofile(None)
        restore_dict(_builtins_dict, _builtins_snapshot)
        restore_dict(_sys_dict, _sys_snapshot)
        restore_dict(_modules, _modules_snapshot)
        for target, snapshot in _list_snapshots:
            target[:] = snapshot
        _setrecursionlimit(_recursion_limit)

    def check_json(value, depth):
        if depth > _MAX_DEPTH:
            raise NotJson("too deep")
        if value is None or _isinstance(value, (_bool, _str)):
            return value
        if _isinstance(value, _int):
            if value > _MAX_SAFE_INT or value < -_MAX_SAFE_INT:
                raise NotJson("int")
            return value
        if _isinstance(value, _float):
            if value != value or value == _INF or value == -_INF:
                raise NotJson("float")
            return value
        if _isinstance(value, (_list, _tuple)):
            return [check_json(item, depth + 1) for item in value]
        if _isinstance(value, _dict):
            checked = {}
            for key, item in value.items():
                if not _isinstance(key, _str):
                    raise NotJson("key")
                checked[key] = check_json(item, depth + 1)
            return checked
        raise NotJson("type")

    def clip(text):
        return text[:_MAX_ERROR]

    def format_error(exc):
        try:
            name = _type(exc).__name__
            if not _isinstance(name, _str):
                name = "Error"
        except _BaseException:
            name = "Error"
        try:
            message = _str(exc)
        except _BaseException:
            message = ""
        return clip(name + (": " + message if message else ""))

    def type_name(value):
        try:
            name = _type(value).__name__
            return name if _isinstance(name, _str) else "?"
        except _BaseException:
            return "?"

    def run_tests(code, function_name, tests):
        namespace = {"__name__": "__student__", "__builtins__": _dict(_builtins_snapshot)}
        setup_error = None
        function = None
        try:
            _exec(_compile(code, "<code>", "exec", dont_inherit=True), namespace)
        except _BaseException as exc:
            setup_error = format_error(exc)
        if setup_error is None:
            function = namespace.get(function_name)
            if function is None:
                setup_error = clip("NameError: function '" + function_name + "' is not defined")
            elif not _callable(function):
                setup_error = clip("TypeError: '" + function_name + "' is not a function")

        results = []
        for test in tests:
            test_id = test["id"]
            if setup_error is not None:
                results.append({"id": test_id, "ok": False, "actual": None, "error": setup_error})
                continue
            try:
                value = function(*test["args"])
            except _BaseException as exc:
                results.append({"id": test_id, "ok": False, "actual": None, "error": format_error(exc)})
                continue
            try:
                encoded = _dumps(check_json(value, 0), allow_nan=False)
            except _BaseException:
                error = clip("TypeError: a result of type '" + type_name(value) + "' is not a JSON value")
                results.append({"id": test_id, "ok": False, "actual": None, "error": error})
                continue
            if _len(encoded) > _MAX_ACTUAL:
                error = clip("ValueError: the result is too large (over " + _str(_MAX_ACTUAL) + " characters)")
                results.append({"id": test_id, "ok": False, "actual": None, "error": error})
                continue
            results.append({"id": test_id, "ok": True, "actual": encoded, "error": None})
        return results

    def run(code, function_name, tests_json):
        tests = _loads(tests_json)
        try:
            results = run_tests(_str(code), _str(function_name), tests)
        finally:
            restore()
        return _dumps(results)

    return run


${HARNESS_ENTRY} = _bh_make()
`;

/** Removes the harness names from __main__ once the JS side holds the entry function. */
export const HARNESS_CLEANUP = `del ${HARNESS_ENTRY}, _bh_make`;

/**
 * Calls the harness entry and converts its JSON output to worker results:
 * [{ id, ok, actual, error }], where `actual` is a parsed JSON value when ok.
 * Throws if the harness output is malformed (the caller reports that as a crash).
 */
export function callHarness(entry, { code, functionName, tests }) {
  const testsJson = JSON.stringify(tests.map((test) => ({ id: test.id, args: test.args ?? [] })));
  const raw = JSON.parse(entry(String(code), String(functionName), testsJson));
  if (!Array.isArray(raw)) throw new Error('harness returned no list');
  return raw.map((item) => ({
    id: item.id,
    ok: item.ok === true,
    actual: item.ok === true ? JSON.parse(item.actual) : null,
    error: item.ok === true ? null : String(item.error ?? 'Error').slice(0, MAX_ERROR_LENGTH),
  }));
}
