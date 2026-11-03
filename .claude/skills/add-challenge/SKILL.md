---
name: add-challenge
description: Adds a new debugging challenge to BugHunter Arena - writes the challenge JSON, validates that the bug is real and hidden, and updates the docs. Use when asked to create, add or draft a challenge.
---

# Add a challenge

A challenge is one JSON file in `server/data/challenges/<id>.json`. The format is defined in `docs/DATA_MODEL.md`; `server/data/challenges/find-max.json` is the reference example.

## Steps

1. **Pick the bug.** One bug only, from a category in `docs/SPEC.md` (wrong initialization, boundary condition, off-by-one, wrong operator, condition order, mutating a collection while iterating, default function behavior). Check the existing challenges so the set stays varied.
2. **Write the buggy code.** 5-20 lines, Python, one function. The bug must not show on ordinary input.
3. **Write the reference solution.** Same signature, fixes only the bug, and defines behavior for edge inputs (for example an empty list returns `None`).
4. **Write the tests.**
   - At least 2 visible tests that pass on the buggy code.
   - At least 2 hidden tests, and at least one of them fails on the buggy code.
   - Arguments go in `args` as a JSON array; Python `None` is JSON `null`.
5. **Set the metadata.** `bug_lines` (1-based), `related_lines` for partial credit, `bug_category`, `bug_description` (cause and consequence, used by the AI as ground truth), `difficulty` (`lako`, `srednje`, `teško`).
6. **Write 3 hints.** Level 1 points at the kind of input, level 2 names the edge case, level 3 points at the code. None of them contains the fix.
7. **Write `keywords_json`.** Three groups of word stems: the cause, the condition that triggers it, the fix. Montenegrin stems, lowercase, so `negativ` matches `negativni` and `negativnih`.
8. **Validate.** Run `node server/scripts/validate-challenges.js`. It must report that visible tests pass on the buggy code, at least one hidden test fails on it, and the reference solution passes all tests. It also fills in `failsOnOriginal` for each test. If the script does not exist yet, create it first: it runs each challenge's code and reference solution with the local Python interpreter over all tests and writes a report.
9. **Seed and document.** Run `node server/scripts/seed.js`, then add the challenge to the challenge table in `docs/SPEC.md`.

## Quality bar

- A student who tries only ordinary inputs should not find the bug. A student who thinks about edge cases should.
- `bug_description` must be specific enough that the AI can judge an explanation against it.
- No hint, title or description gives the fix away.
