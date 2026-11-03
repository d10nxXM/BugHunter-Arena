"""Tests for tools/check-challenge.py. Run: python -B -m unittest discover tools"""

import copy
import importlib.util
import io
import json
import os
import shutil
import tempfile
import time
import unittest
from contextlib import redirect_stderr, redirect_stdout
from unittest import mock

_HERE = os.path.dirname(os.path.abspath(__file__))
_spec = importlib.util.spec_from_file_location(
    "check_challenge", os.path.join(_HERE, "check-challenge.py")
)
cc = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(cc)

BUGGY = (
    "def find_max(numbers):\n"
    "    max_value = 0\n"
    "    for number in numbers:\n"
    "        if number > max_value:\n"
    "            max_value = number\n"
    "    return max_value"
)
REFERENCE = (
    "def find_max(numbers):\n"
    "    if not numbers:\n"
    "        return None\n"
    "    max_value = numbers[0]\n"
    "    for number in numbers[1:]:\n"
    "        if number > max_value:\n"
    "            max_value = number\n"
    "    return max_value"
)

GOOD = {
    "id": "find-max",
    "title": "Najveći element liste",
    "language": "python",
    "function_name": "find_max",
    "code": BUGGY,
    "reference_solution": REFERENCE,
    "tests_json": [
        {"id": "t1", "args": [[2, 5, 1]], "expected": 5, "visible": True},
        {"id": "t2", "args": [[7]], "expected": 7, "visible": True},
        {"id": "t3", "args": [[-8, -3, -10]], "expected": -3, "visible": False},
        {"id": "t4", "args": [[]], "expected": None, "visible": False},
    ],
}


class Fixture(unittest.TestCase):
    def setUp(self):
        self.dir = tempfile.mkdtemp(prefix="bha-check-test-")

    def tearDown(self):
        shutil.rmtree(self.dir, ignore_errors=True)

    def write(self, data, text=None, name="find-max.json"):
        path = os.path.join(self.dir, name)
        if text is None:
            text = json.dumps(data, indent=2, ensure_ascii=False) + "\n"
        with open(path, "wb") as handle:
            handle.write(text.encode("utf-8"))
        return path

    def read(self, path):
        with open(path, "rb") as handle:
            return handle.read().decode("utf-8")

    def run_main(self, *paths):
        buf = io.StringIO()
        with redirect_stdout(buf):
            code = cc.main(list(paths))
        return code, buf.getvalue()


class JsonEqualTest(unittest.TestCase):
    def test_none_and_null(self):
        self.assertTrue(cc.json_equal(None, None))
        self.assertFalse(cc.json_equal(0, None))

    def test_int_equals_float(self):
        self.assertTrue(cc.json_equal(1, 1.0))

    def test_bool_is_not_number(self):
        self.assertFalse(cc.json_equal(True, 1))
        self.assertFalse(cc.json_equal(0, False))
        self.assertTrue(cc.json_equal(False, False))

    def test_lists_and_objects(self):
        self.assertTrue(cc.json_equal([1, [2, None]], [1.0, [2, None]]))
        self.assertFalse(cc.json_equal([1, 2], [2, 1]))
        self.assertTrue(cc.json_equal({"a": [1]}, {"a": [1.0]}))
        self.assertFalse(cc.json_equal({"a": 1}, {"a": 1, "b": 2}))


class RunTestTest(unittest.TestCase):
    def test_tuple_result_becomes_list(self):
        ok, value = cc.run_test("def f(a):\n    return (a, a)", "f", [1])
        self.assertTrue(ok)
        self.assertEqual(value, [1, 1])

    def test_set_result_fails(self):
        ok, reason = cc.run_test("def f():\n    return {1}", "f", [])
        self.assertFalse(ok)
        self.assertIn("not JSON", reason)

    def test_exception_fails(self):
        ok, reason = cc.run_test("def f():\n    return 1 / 0", "f", [])
        self.assertFalse(ok)
        self.assertIn("ZeroDivisionError", reason)

    def test_print_does_not_break_result(self):
        ok, value = cc.run_test("def f():\n    print('hi')\n    return 2", "f", [])
        self.assertEqual((ok, value), (True, 2))

    def test_null_arg_is_none(self):
        ok, value = cc.run_test("def f(x):\n    return x is None", "f", [None])
        self.assertEqual((ok, value), (True, True))


class CheckFileTest(Fixture):
    def test_good_challenge_writes_flags(self):
        path = self.write(GOOD)
        code, out = self.run_main(path)
        self.assertEqual(code, 0, out)
        tests = json.loads(self.read(path))["tests_json"]
        self.assertEqual(
            [t["failsOnOriginal"] for t in tests], [False, False, True, True]
        )
        # Key order kept, flag appended last, trailing newline kept.
        self.assertEqual(
            list(tests[0].keys()),
            ["id", "args", "expected", "visible", "failsOnOriginal"],
        )
        self.assertTrue(self.read(path).endswith("}\n"))
        self.assertIn("Najveći", self.read(path))

    def test_correct_flags_leave_file_byte_identical(self):
        data = copy.deepcopy(GOOD)
        for test, flag in zip(data["tests_json"], [False, False, True, True]):
            test["failsOnOriginal"] = flag
        text = json.dumps(data, ensure_ascii=False)  # compact, no newline
        path = self.write(data, text=text)
        code, out = self.run_main(path)
        self.assertEqual(code, 0, out)
        self.assertIn("unchanged", out)
        self.assertEqual(self.read(path), text)

    def test_wrong_flag_is_fixed_in_place_keeping_formatting(self):
        data = copy.deepcopy(GOOD)
        lines = []
        for test, flag in zip(data["tests_json"], [False, True, True, False]):
            test["failsOnOriginal"] = flag
            lines.append("    " + json.dumps(test))
        text = (
            json.dumps({k: v for k, v in data.items() if k != "tests_json"},
                       indent=2, ensure_ascii=False)[:-2]
            + ',\n  "tests_json": [\n' + ",\n".join(lines) + "\n  ]\n}\n"
        )
        path = self.write(data, text=text)
        code, out = self.run_main(path)
        self.assertEqual(code, 0, out)
        self.assertIn("UPDATED", out)
        new_text = self.read(path)
        expected = (
            text.replace('"t2", "args": [[7]], "expected": 7, "visible": true, '
                         '"failsOnOriginal": true',
                         '"t2", "args": [[7]], "expected": 7, "visible": true, '
                         '"failsOnOriginal": false')
            .replace('"visible": false, "failsOnOriginal": false',
                     '"visible": false, "failsOnOriginal": true')
        )
        self.assertNotEqual(text, expected)
        self.assertEqual(new_text, expected)

    def test_visible_test_failing_on_buggy_code(self):
        data = copy.deepcopy(GOOD)
        data["tests_json"][1]["args"] = [[-7]]
        data["tests_json"][1]["expected"] = -7
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: test t2: visible test fails", out)
        self.assertEqual(self.read(path), before)

    def test_no_hidden_test_fails(self):
        data = copy.deepcopy(GOOD)
        data["tests_json"][2] = {
            "id": "t3", "args": [[1, 9]], "expected": 9, "visible": False
        }
        data["tests_json"][3] = {
            "id": "t4", "args": [[4]], "expected": 4, "visible": False
        }
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("no hidden test fails", out)
        self.assertIn("t3, t4", out)
        self.assertEqual(self.read(path), before)

    def test_reference_failing(self):
        data = copy.deepcopy(GOOD)
        data["reference_solution"] = REFERENCE.replace(
            "return None", "return 0"
        )
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: test t4: reference_solution fails", out)
        self.assertEqual(self.read(path), before)

    def test_infinite_loop_times_out_as_failure(self):
        data = copy.deepcopy(GOOD)
        data["reference_solution"] = (
            "def find_max(numbers):\n"
            "    if not numbers:\n"
            "        while True:\n"
            "            pass\n"
            "    return max(numbers)"
        )
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("test t4: reference_solution fails (timeout", out)
        self.assertEqual(self.read(path), before)

    def test_unsupported_language_is_skipped(self):
        data = copy.deepcopy(GOOD)
        data["language"] = "javascript"
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("not supported", out)
        self.assertEqual(self.read(path), before)

    def test_invalid_json(self):
        path = self.write(None, text="{ nope")
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: cannot read", out)

    def test_two_files_one_passes_one_fails(self):
        # Each file is checked and written independently: the passing file is
        # updated, the failing file is left byte-identical, exit code is 1.
        good = self.write(GOOD, name="good.json")
        bad_data = copy.deepcopy(GOOD)
        bad_data["reference_solution"] = REFERENCE.replace(
            "return None", "return 0"
        )
        bad = self.write(bad_data, name="bad.json")
        bad_before = self.read(bad)
        code, out = self.run_main(good, bad)
        self.assertEqual(code, 1)
        self.assertIn("good.json: OK, failsOnOriginal UPDATED", out)
        self.assertIn("bad.json: test t4: reference_solution fails", out)
        good_tests = json.loads(self.read(good))["tests_json"]
        self.assertEqual(
            [t["failsOnOriginal"] for t in good_tests],
            [False, False, True, True],
        )
        self.assertEqual(self.read(bad), bad_before)

    def test_two_passing_files_exit_zero(self):
        a = self.write(GOOD, name="a.json")
        b = self.write(GOOD, name="b.json")
        code, out = self.run_main(a, b)
        self.assertEqual(code, 0, out)

    def test_no_arguments(self):
        with redirect_stderr(io.StringIO()):
            self.assertEqual(cc.main([]), 1)


class RunModelTest(Fixture):
    def test_whole_run_timeout_on_buggy_code_fails_check_a(self):
        # The buggy code loops forever on the hidden empty-list test. The whole
        # run times out, so the visible tests fail too, as in the browser.
        data = copy.deepcopy(GOOD)
        data["code"] = (
            "def find_max(numbers):\n"
            "    while not numbers:\n"
            "        pass\n"
            "    return max(numbers)"
        )
        path = self.write(data)
        before = self.read(path)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: buggy code timed out (whole run, 3 s)", out)
        self.assertIn("test t1: visible test fails on the buggy code (timeout", out)
        self.assertIn("test t2: visible test fails on the buggy code (timeout", out)
        self.assertNotIn("reference timed out", out)
        self.assertEqual(self.read(path), before)

    def test_module_state_is_shared_between_tests_of_one_run(self):
        code = "calls = []\ndef f(x):\n    calls.append(x)\n    return list(calls)"
        timed_out, results = cc.run_tests(code, "f", [[1], [2], [3]])
        self.assertFalse(timed_out)
        self.assertEqual(results, [(True, [1]), (True, [1, 2]), (True, [1, 2, 3])])

    def test_exception_fails_only_that_test(self):
        code = "def f(x):\n    return 10 // x"
        timed_out, results = cc.run_tests(code, "f", [[2], [0], [5]])
        self.assertFalse(timed_out)
        self.assertEqual(results[0], (True, 5))
        self.assertFalse(results[1][0])
        self.assertIn("ZeroDivisionError", results[1][1])
        self.assertEqual(results[2], (True, 2))

    def test_grandchild_process_does_not_hang_the_tool(self):
        # The challenge starts a sleeping grandchild that inherits the result
        # pipes, then loops forever. Without a tree kill, waiting for the pipes
        # would block until the grandchild exits (30 s).
        code = (
            "import subprocess, sys\n"
            "def f():\n"
            "    subprocess.Popen(\n"
            "        [sys.executable, '-I', '-c', 'import time; time.sleep(30)'],\n"
            "        stdout=sys.__stdout__, stderr=sys.__stderr__)\n"
            "    while True:\n"
            "        pass\n"
        )
        start = time.monotonic()
        timed_out, results = cc.run_tests(code, "f", [[]], timeout=1)
        elapsed = time.monotonic() - start
        self.assertTrue(timed_out)
        self.assertFalse(results[0][0])
        # Well below timeout + KILL_WAIT_SECONDS, which is what a grandchild
        # that survived the kill would cost.
        self.assertLess(elapsed, 1 + cc.KILL_WAIT_SECONDS - 1)

    def test_child_environment_is_scrubbed(self):
        code = "import os\ndef f():\n    return 'BHA_SENTINEL_SECRET' in os.environ"
        with mock.patch.dict(os.environ, {"BHA_SENTINEL_SECRET": "leak"}):
            self.assertEqual(cc.run_test(code, "f", []), (True, False))

    def test_print_flood_is_capped(self):
        code = "def f():\n    print('x' * 1000000)\n    return 1"
        self.assertEqual(cc.run_test(code, "f", []), (True, 1))


class InputCheckTest(Fixture):
    def test_duplicate_test_ids_are_rejected(self):
        data = copy.deepcopy(GOOD)
        data["tests_json"][3]["id"] = "t2"
        path = self.write(data)
        before = self.read(path)
        with mock.patch.object(cc, "run_tests") as run:
            code, out = self.run_main(path)
        run.assert_not_called()
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: duplicate test id t2", out)
        self.assertEqual(self.read(path), before)

    def test_missing_language_is_reported(self):
        data = copy.deepcopy(GOOD)
        del data["language"]
        path = self.write(data)
        code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: language missing", out)
        self.assertNotIn("None", out)

    def test_non_bool_flag_is_rewritten(self):
        data = copy.deepcopy(GOOD)
        for test, flag in zip(data["tests_json"], [0, False, 1, True]):
            test["failsOnOriginal"] = flag
        path = self.write(data)
        code, out = self.run_main(path)
        self.assertEqual(code, 0, out)
        self.assertIn("UPDATED", out)
        flags = [t["failsOnOriginal"] for t in json.loads(self.read(path))["tests_json"]]
        self.assertEqual(flags, [False, False, True, True])
        self.assertTrue(all(type(v) is bool for v in flags))


class WriteTest(Fixture):
    def test_failed_replace_keeps_original_and_leaves_no_temp_file(self):
        path = self.write(GOOD)
        before = self.read(path)
        with mock.patch.object(cc.os, "replace", side_effect=OSError("disk full")):
            code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: cannot write: disk full", out)
        self.assertEqual(self.read(path), before)
        self.assertEqual(os.listdir(self.dir), ["find-max.json"])

    def test_write_error_is_reported_and_next_file_is_processed(self):
        first = self.write(GOOD, name="a.json")
        second = self.write(GOOD, name="b.json")
        first_before = self.read(first)
        real_replace = os.replace

        def replace(src, dst):
            if os.path.basename(dst) == "a.json":
                raise OSError("read-only")
            return real_replace(src, dst)

        with mock.patch.object(cc.os, "replace", side_effect=replace):
            code, out = self.run_main(first, second)
        self.assertEqual(code, 1)
        self.assertIn("a.json: cannot write: read-only", out)
        self.assertIn("b.json: OK, failsOnOriginal UPDATED", out)
        self.assertEqual(self.read(first), first_before)
        flags = [t["failsOnOriginal"] for t in json.loads(self.read(second))["tests_json"]]
        self.assertEqual(flags, [False, False, True, True])
        self.assertEqual(sorted(os.listdir(self.dir)), ["a.json", "b.json"])

    def test_file_changed_during_check_is_not_written(self):
        path = self.write(GOOD)
        edited = self.read(path).replace("Najveći", "Najveci")
        real_evaluate = cc.evaluate

        def evaluate_then_edit(data):
            result = real_evaluate(data)
            with open(path, "wb") as handle:
                handle.write(edited.encode("utf-8"))
            return result

        with mock.patch.object(cc, "evaluate", side_effect=evaluate_then_edit):
            code, out = self.run_main(path)
        self.assertEqual(code, 1)
        self.assertIn("find-max.json: changed during check", out)
        self.assertEqual(self.read(path), edited)


if __name__ == "__main__":
    unittest.main()
