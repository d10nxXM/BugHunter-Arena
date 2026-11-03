"""Behavior check for BugHunter Arena challenge files.

AUTHOR TOOL. It runs trusted challenge code (the buggy `code` and the
`reference_solution` written by the challenge author) with the author's local
Python. It is never part of the server runtime: nothing in server/ may import
or run it, and it must never be used on student-submitted code.

Usage:
    python tools/check-challenge.py <challenge.json> [<challenge.json> ...]

Python 3 standard library only.

Run model (matches the browser client, see .claude/agents/test-runner.md):
  - All tests for one code string (the buggy `code`, or `reference_solution`)
    run in ONE child process with ONE 3 s budget for the whole run. Inside
    the child the code is executed once in a fresh namespace, then the tests
    run in order and each result is recorded. Module-level state is therefore
    shared between the tests of one run, as in the client.
  - An exception in one test fails only that test.
  - If the whole run exceeds 3 s, every test of that run counts as failed and
    "<file>: <buggy code|reference> timed out (whole run, 3 s)" is printed.
    So a challenge whose buggy code loops forever on a hidden test fails
    check (a), because its visible tests then fail too. That is what the
    browser would show the student.
  - The child is `python -I` in a temporary working directory, gets its input
    as JSON on stdin (no shell), and its environment holds only what Python
    needs to start (SYSTEMROOT on Windows, nothing on POSIX), so secrets such
    as LLM_API_KEY never reach challenge code. Challenge prints go to stderr
    and are capped at 64 KB.
  - On timeout the whole process tree is killed (taskkill /T on Windows, the
    process group on POSIX), so a grandchild process cannot hang the tool.

Only `language: "python"` is supported; other languages are reported and
skipped (exit code 1). Before anything runs, the tests are checked for shape
and duplicate ids.

Checks:
  (a) every visible test passes on the buggy code
  (b) at least one hidden test fails on the buggy code
  (c) the reference solution passes every test

If every check passes, `failsOnOriginal` (true when the test failed on the
buggy code) is written into each test of the file. The file is only rewritten
when a value changes or is missing; everything else in the file is kept. If
any check fails, the file is not touched and each problem is printed with the
file name and test id. A value that is not a JSON boolean (for example 1) is
rewritten. Writes are atomic (temp file in the same directory, fsync,
os.replace); a file that changed on disk while it was being checked, or that
cannot be written, is reported and counts as failed, and the remaining files
are still processed. Exit code 0 only if every file passed.

Comparison rule (JSON-equivalent equality, matching the client, which compares
results as JSON values):
  - The function's return value is converted to JSON (`json.dumps` with
    allow_nan=False), so tuples become lists and dict keys become strings.
    A value that cannot be converted (set, object, NaN, Infinity) fails.
  - The converted value is compared with `expected` structurally:
    null == None; booleans equal only booleans (true != 1);
    numbers compare by value, so 1 == 1.0 (JSON does not distinguish them);
    strings by value; lists element by element in order;
    objects by the same keys with equal values.
"""

import json
import os
import re
import shutil
import signal
import subprocess
import sys
import tempfile

TIMEOUT_SECONDS = 3
# Upper bound on waiting for the pipes after the process tree was killed.
KILL_WAIT_SECONDS = 5
# Challenge prints (stdout and stderr together) kept per run, in characters.
OUTPUT_CAP = 64 * 1024
# Largest result document accepted from the child, in bytes.
MAX_RESULT_BYTES = 4 * 1024 * 1024

# Runs inside the child process. Reads {code, function_name, tests,
# output_cap} from stdin, where tests is a list of argument lists. Executes the
# code once in a fresh namespace, then calls the function for each test in
# order and writes a JSON list to stdout with one {"ok": true, "result": ...}
# or {"ok": false, "error": "..."} per test. Each result is serialized right
# after its call, so a later test cannot change an earlier result. The
# challenge's own prints go to stderr, capped, so they can neither corrupt the
# result nor fill the parent's memory.
_RUNNER = r"""
import json, sys

class _Capped:
    def __init__(self, target, limit):
        self._target = target
        self._left = limit
    def write(self, text):
        if self._left > 0:
            part = text[: self._left]
            self._left -= len(part)
            try:
                self._target.write(part)
            except Exception:
                pass
        return len(text)
    def flush(self):
        try:
            self._target.flush()
        except Exception:
            pass
    def isatty(self):
        return False

payload = json.loads(sys.stdin.buffer.read().decode("utf-8"))
real_stdout = sys.stdout.buffer
sys.stdout = sys.stderr = _Capped(sys.__stderr__, payload["output_cap"])

def describe(exc):
    return "%s: %s" % (type(exc).__name__, exc)

setup_error = None
fn = None
try:
    namespace = {"__name__": "__challenge__"}
    exec(compile(payload["code"], "<challenge>", "exec"), namespace)
    fn = namespace.get(payload["function_name"])
    if not callable(fn):
        raise NameError("function %r is not defined" % payload["function_name"])
except BaseException as exc:
    setup_error = describe(exc)

items = []
for args in payload["tests"]:
    if setup_error is not None:
        items.append(json.dumps({"ok": False, "error": setup_error}))
        continue
    try:
        result = fn(*args)
        try:
            items.append(json.dumps({"ok": True, "result": result}, allow_nan=False))
        except (TypeError, ValueError) as exc:
            items.append(json.dumps({"ok": False, "error": "result is not JSON: %s" % exc}))
    except BaseException as exc:
        items.append(json.dumps({"ok": False, "error": describe(exc)}))

real_stdout.write(("[" + ",".join(items) + "]").encode("utf-8"))
real_stdout.flush()
"""


def json_equal(actual, expected):
    """Structural JSON equality. See the module docstring for the rule."""
    if isinstance(actual, bool) or isinstance(expected, bool):
        return (
            isinstance(actual, bool)
            and isinstance(expected, bool)
            and actual == expected
        )
    if actual is None or expected is None:
        return actual is None and expected is None
    if isinstance(actual, (int, float)) and isinstance(expected, (int, float)):
        return actual == expected
    if isinstance(actual, str) and isinstance(expected, str):
        return actual == expected
    if isinstance(actual, list) and isinstance(expected, list):
        return len(actual) == len(expected) and all(
            json_equal(a, e) for a, e in zip(actual, expected)
        )
    if isinstance(actual, dict) and isinstance(expected, dict):
        return actual.keys() == expected.keys() and all(
            json_equal(actual[k], expected[k]) for k in actual
        )
    return False


def _child_env():
    """The minimal environment the child Python needs to start.

    Never the author's environment, so secrets such as LLM_API_KEY cannot
    reach challenge code. On Windows Python needs SYSTEMROOT; on POSIX it
    starts with an empty environment.
    """
    if os.name == "nt":
        return {"SYSTEMROOT": os.environ.get("SYSTEMROOT", r"C:\Windows")}
    return {}


def _kill_tree(proc):
    """Kills the child and every process it started."""
    if os.name == "nt":
        root = os.environ.get("SYSTEMROOT", r"C:\Windows")
        taskkill = os.path.join(root, "System32", "taskkill.exe")
        try:
            subprocess.run(
                [taskkill, "/T", "/F", "/PID", str(proc.pid)],
                stdin=subprocess.DEVNULL,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                timeout=KILL_WAIT_SECONDS,
                check=False,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            print("warning: taskkill failed (%s)" % exc, file=sys.stderr)
    else:
        try:
            os.killpg(proc.pid, signal.SIGKILL)
        except ProcessLookupError:
            pass
        except OSError as exc:
            print("warning: killpg failed (%s)" % exc, file=sys.stderr)
    # Backstop for the direct child in case the tree kill did not reach it.
    try:
        proc.kill()
    except OSError:
        pass


def run_tests(code, function_name, args_list, timeout=None):
    """Runs every test of one code string in ONE isolated process.

    Returns (timed_out, results), with one (ok, result_or_error) per entry of
    args_list. If the whole run exceeds `timeout` seconds, timed_out is True
    and every test has failed.
    """
    timeout = TIMEOUT_SECONDS if timeout is None else timeout
    count = len(args_list)
    payload = json.dumps(
        {
            "code": code,
            "function_name": function_name,
            "tests": args_list,
            "output_cap": OUTPUT_CAP,
        }
    ).encode("utf-8")
    if os.name == "nt":
        group = {"creationflags": subprocess.CREATE_NEW_PROCESS_GROUP}
    else:
        group = {"start_new_session": True}

    workdir = tempfile.mkdtemp(prefix="bha-check-")
    try:
        proc = subprocess.Popen(
            [sys.executable, "-I", "-c", _RUNNER],
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            cwd=workdir,
            env=_child_env(),
            **group,
        )
        try:
            stdout, _stderr = proc.communicate(payload, timeout=timeout)
        except subprocess.TimeoutExpired:
            _kill_tree(proc)
            try:
                proc.communicate(timeout=KILL_WAIT_SECONDS)
            except subprocess.TimeoutExpired:
                # Something outside the tree still holds the pipes. Stop
                # waiting; the run has failed either way.
                pass
            reason = "timeout: whole run exceeded %g s" % timeout
            return True, [(False, reason)] * count
    finally:
        # On Windows a process that is still alive may hold the directory.
        shutil.rmtree(workdir, ignore_errors=True)

    if len(stdout) > MAX_RESULT_BYTES:
        return False, [(False, "result output too large")] * count
    crashed = "process crashed (exit code %s)" % proc.returncode
    try:
        outcomes = json.loads(stdout.decode("utf-8"))
    except (UnicodeDecodeError, ValueError):
        return False, [(False, crashed)] * count
    if not isinstance(outcomes, list) or len(outcomes) != count:
        return False, [(False, crashed)] * count
    results = []
    for outcome in outcomes:
        if isinstance(outcome, dict) and outcome.get("ok"):
            results.append((True, outcome.get("result")))
        else:
            error = outcome.get("error") if isinstance(outcome, dict) else None
            results.append((False, error or "unknown error"))
    return False, results


def run_test(code, function_name, args, timeout=None):
    """Runs one call in a fresh isolated process. Returns (ok, result_or_error)."""
    return run_tests(code, function_name, [args], timeout)[1][0]


def _describe(value):
    text = json.dumps(value, ensure_ascii=False)
    return text if len(text) <= 80 else text[:77] + "..."


def compare(outcome, test):
    """Returns (passed, reason) for one test outcome. reason is None when passed."""
    ok, value = outcome
    if not ok:
        return False, value
    if json_equal(value, test["expected"]):
        return True, None
    return False, "returned %s, expected %s" % (
        _describe(value),
        _describe(test["expected"]),
    )


def check_input(data):
    """Checks the shape of the challenge before anything runs.

    Returns a list of problems (without the file name).
    """
    if data.get("language") is None:
        return ['language missing (only "python" is supported), skipped']
    if data.get("language") != "python":
        return [
            'language %r is not supported (only "python"), skipped'
            % data.get("language")
        ]

    problems = []
    for key in ("code", "reference_solution", "function_name"):
        if not isinstance(data.get(key), str) or not data.get(key):
            problems.append("%s is missing or not a string" % key)
    tests = data.get("tests_json")
    if not isinstance(tests, list) or not tests:
        problems.append("tests_json is missing or empty")
    elif not all(
        isinstance(t, dict)
        and isinstance(t.get("id"), str)
        and isinstance(t.get("args"), list)
        and "expected" in t
        and isinstance(t.get("visible"), bool)
        for t in tests
    ):
        problems.append(
            "every test needs id (string), args (array), expected, visible (boolean)"
        )
    else:
        seen = set()
        reported = set()
        for test in tests:
            tid = test["id"]
            if tid in seen and tid not in reported:
                problems.append("duplicate test id %s" % tid)
                reported.add(tid)
            seen.add(tid)
    return problems


def evaluate(data):
    """Runs the checks on parsed challenge data.

    Returns (problems, fails_on_original) where problems is a list of strings
    (without the file name) and fails_on_original maps test id -> bool.
    """
    problems = check_input(data)
    if problems:
        return problems, {}

    tests = data["tests_json"]
    args_list = [t["args"] for t in tests]
    fn_name = data["function_name"]
    buggy_timed_out, buggy = run_tests(data["code"], fn_name, args_list)
    ref_timed_out, ref = run_tests(data["reference_solution"], fn_name, args_list)
    if buggy_timed_out:
        problems.append("buggy code timed out (whole run, %g s)" % TIMEOUT_SECONDS)
    if ref_timed_out:
        problems.append("reference timed out (whole run, %g s)" % TIMEOUT_SECONDS)

    fails_on_original = {}
    for test, buggy_outcome, ref_outcome in zip(tests, buggy, ref):
        tid = test["id"]
        passed, reason = compare(buggy_outcome, test)
        fails_on_original[tid] = not passed
        if test["visible"] and not passed:
            problems.append(
                "test %s: visible test fails on the buggy code (%s)" % (tid, reason)
            )
        ref_passed, ref_reason = compare(ref_outcome, test)
        if not ref_passed:
            problems.append(
                "test %s: reference_solution fails (%s)" % (tid, ref_reason)
            )

    hidden = [t for t in tests if not t["visible"]]
    if not any(fails_on_original[t["id"]] for t in hidden):
        problems.append(
            "no hidden test fails on the buggy code (hidden tests: %s)"
            % ", ".join(t["id"] for t in hidden)
        )
    return problems, fails_on_original


_FLAG = re.compile(r'("failsOnOriginal"\s*:\s*)(true|false)')


def render_updated(text, data, fails_on_original):
    """Returns the new file text, or None if nothing changes.

    A value counts as unchanged only if it is a real boolean equal to the
    wanted one (`type(v) is bool`), so 1 or 0 is rewritten as true or false.
    Tries a minimal in-place edit of the existing `failsOnOriginal` values so
    the author's formatting is kept. Falls back to a full re-dump (2-space
    indent, ensure_ascii=False, key order kept) when a key must be added or
    replaced, or the minimal edit cannot be verified.
    """
    tests = data["tests_json"]
    current = [t.get("failsOnOriginal") for t in tests]
    wanted = [fails_on_original[t["id"]] for t in tests]
    if all(type(c) is bool and c == w for c, w in zip(current, wanted)):
        return None

    updated = json.loads(text)
    for test in updated["tests_json"]:
        test["failsOnOriginal"] = fails_on_original[test["id"]]

    if all(type(v) is bool for v in current):
        matches = list(_FLAG.finditer(text))
        if len(matches) == len(tests):
            pieces = []
            last = 0
            for match, value in zip(matches, wanted):
                pieces.append(text[last : match.start(2)])
                pieces.append("true" if value else "false")
                last = match.end(2)
            pieces.append(text[last:])
            patched = "".join(pieces)
            try:
                if json.loads(patched) == updated:
                    return patched
            except ValueError:
                pass

    newline = "\r\n" if "\r\n" in text else "\n"
    dumped = json.dumps(updated, indent=2, ensure_ascii=False)
    if newline != "\n":
        dumped = dumped.replace("\n", newline)
    if text.endswith(("\n", "\r\n")):
        dumped += newline
    return dumped


def atomic_write(path, content):
    """Writes bytes to path atomically: temp file in the same directory, flush,
    fsync, then os.replace. The temp file is removed on any error, and the
    error is raised to the caller."""
    directory = os.path.dirname(os.path.abspath(path))
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(
            dir=directory,
            prefix="." + os.path.basename(path) + ".",
            suffix=".tmp",
            delete=False,
        ) as tmp:
            tmp_path = tmp.name
            tmp.write(content)
            tmp.flush()
            os.fsync(tmp.fileno())
        shutil.copymode(path, tmp_path)
        os.replace(tmp_path, path)
        tmp_path = None
    finally:
        if tmp_path is not None:
            try:
                os.remove(tmp_path)
            except OSError as exc:
                print(
                    "warning: cannot remove temp file %s (%s)" % (tmp_path, exc),
                    file=sys.stderr,
                )


def _read_bytes(path):
    with open(path, "rb") as handle:
        return handle.read()


def check_file(path, out=print):
    """Checks one file and updates it if every check passes. Returns True if ok."""
    name = os.path.basename(path)
    try:
        raw = _read_bytes(path)
        text = raw.decode("utf-8")
        data = json.loads(text)
    except (OSError, UnicodeDecodeError, ValueError) as exc:
        out("%s: cannot read challenge JSON (%s)" % (name, exc))
        return False
    if not isinstance(data, dict):
        out("%s: top level must be an object" % name)
        return False

    problems, fails_on_original = evaluate(data)
    if problems:
        for problem in problems:
            out("%s: %s" % (name, problem))
        return False

    new_text = render_updated(text, data, fails_on_original)
    summary = ", ".join(
        "%s=%s" % (tid, "true" if v else "false")
        for tid, v in fails_on_original.items()
    )
    if new_text is None:
        out("%s: OK, failsOnOriginal unchanged (%s)" % (name, summary))
        return True
    try:
        if _read_bytes(path) != raw:
            out("%s: changed during check, not written" % name)
            return False
        atomic_write(path, new_text.encode("utf-8"))
    except OSError as exc:
        out("%s: cannot write: %s" % (name, exc))
        return False
    out("%s: OK, failsOnOriginal UPDATED (%s)" % (name, summary))
    return True


def main(argv=None):
    paths = sys.argv[1:] if argv is None else argv
    if not paths:
        print(
            "usage: python tools/check-challenge.py <challenge.json> [...]",
            file=sys.stderr,
        )
        return 1
    results = [check_file(path) for path in paths]
    return 0 if all(results) else 1


if __name__ == "__main__":
    try:
        sys.stdout.reconfigure(errors="backslashreplace")
    except AttributeError:
        pass
    sys.exit(main())
