---
name: add-challenge
description: Adds a new debugging challenge to BugHunter Arena - writes the challenge JSON, sets failsOnOriginal and checks behavior with tools/check-challenge.py, checks its structure with validate-challenges, and updates the docs. Use when asked to create, add or draft a challenge.
---

# Add a challenge

A challenge is one JSON file in `server/data/challenges/<id>.json`. The format is defined in `docs/DATA_MODEL.md`; `server/data/challenges/find-max.json` is the reference example.

## Steps

1. **Pick the bug.** One bug only, using the exact Montenegrin category name from the Bug categories table in `docs/SPEC.md` (e.g. `Pogrešna inicijalizacija`). Names marked Proposed need the user's confirmation first. Check the existing challenges so the set stays varied.
2. **Write the buggy code.** 5-20 lines, Python, one function. The bug must not show on ordinary input.
3. **Write the reference solution.** Same signature, fixes only the bug, and defines behavior for edge inputs (for example an empty list returns `None`).
4. **Write the tests.**
   - At least 2 visible tests that pass on the buggy code (`failsOnOriginal: false`).
   - At least 1 hidden test (the validator's minimum; 2 or more recommended), and at least one hidden test fails on the buggy code (`failsOnOriginal: true`). Test ids are unique.
   - Arguments go in `args` as a JSON array; Python `None` is JSON `null`.
5. **Set the metadata.** `bug_lines` (1-based), `related_lines` for partial credit, `bug_category`, `bug_description` (cause and consequence, used by the AI as ground truth), `difficulty` (`lako`, `srednje`, `teško`).
6. **Write 3 hints.** Level 1 points at the kind of input, level 2 names the edge case, level 3 points at the code. None of them contains the fix. Exactly 3, none empty.
7. **Write `keywords_json`.** Three groups of word stems: the cause, the condition that triggers it, the fix. Montenegrin stems, lowercase, so `negativ` matches `negativni` and `negativnih`. Exactly 3 groups, each with at least one stem.
8. **Check behavior, then validate.** Two commands, in this order:
   1. From the repo root, run `python tools/check-challenge.py server/data/challenges/<id>.json`. It runs the buggy `code` and the `reference_solution` on every test. All tests for one code string (the buggy code, or the reference solution) run in one isolated Python process with one 3 s budget for the whole run, like the browser client. If the run times out, every test in it counts as failed. The process tree is killed and the child gets a minimal environment (no secrets from the author's shell). It checks that every visible test passes on the buggy code, that at least one hidden test fails on it, and that the reference solution passes all tests. If all three hold, it writes `failsOnOriginal` into each test. Each file is checked on its own. A file that fails a check is not written. The exit code is 1 if any file fails; fix the challenge and run it again. The tool writes each file atomically and rejects duplicate test ids. If the tool had to rewrite the whole file (when a `failsOnOriginal` key was missing or not a boolean, or, rarely, when the in-place edit couldn't be verified), check `git diff` and restore the one-line-per-test layout by hand. Don't run prettier on challenge files. It uses your local Python 3 (standard library only) and supports Python challenges only. It is an author tool: it runs trusted challenge code on the author's machine, and it is never imported or run from `server/`.
   2. In `server/`, run `npm run validate:challenges`. It checks structure only and never runs code. It prints every problem with its file name and exits with code 1 if anything is wrong. The full list of rules is in `docs/DATA_MODEL.md` under "Validation rules".
9. Run `npm run seed` in `server/`, then add the challenge to the challenge table in `docs/SPEC.md`, with the category name exactly as in the JSON.

## Quality bar

- A student who tries only ordinary inputs should not find the bug. A student who thinks about edge cases should.
- `bug_description` must be specific enough that the AI can judge an explanation against it.
- No hint, title or description gives the fix away.
