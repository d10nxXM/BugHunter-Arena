# BugHunter Arena - Scoring

Score is 0-100. Three components (70 points) are deterministic; the explanation (30 points) is judged by the AI or, without it, by keywords. Hints subtract points. Time is shown but never affects the score. Scoring runs only in `server/src/services/scoringService.js`.

## Components

| Component | Points | Checked by | Rule |
| --- | --- | --- | --- |
| Bug identification | 40 | Server | 40: a `bug_lines` line is selected and at most 3 lines are selected. 20: only a `related_lines` line is selected, or a bug line is selected among more than 3. 0: otherwise |
| Explanation | 30 | AI, else keywords | `round(explanation_quality * 3)`, quality 0-10 |
| Edge case | 20 | Browser results, scored on server | 20: input exposes the bug and the expected result is correct. 10: exposes the bug, expected result wrong. 0: does not expose the bug |
| Fix | 10 | Tests | 10: passes all tests. 5: passes at least one test that fails on the original (`failsOnOriginal`). 0: otherwise |

## Rules

- An edge case **exposes the bug** when the original code and the reference solution return different values for that input (`originalOutput !== referenceOutput`, compared as JSON), or when the original raised. `edgeCaseCheck.error` is the only signal that something raised: a non-empty string means the original code raised, and the edge case then exposes the bug whatever the two outputs are. The reference solution is trusted not to raise, so the request has no separate error field for it.
- The expected result is **correct** when it equals `referenceOutput` as JSON.
- Results compare as JSON values: `None` is `null`; numbers by value (`1 == 1.0`); booleans equal only booleans (`true != 1`); strings by value; lists element by element in order; objects by the same keys in any order. NaN, Infinity, sets and other non-JSON values never match.
- A fix identical to the original code (ignoring whitespace) scores 0.
- Fix scoring trusts the browser's results. A test counts as passed when its `passed` is `true` and its `error` is not `"timeout"`; a test with `error: "timeout"` counts as failed. `actual` is not re-checked on the server, and results whose `id` is not a test of the challenge are ignored.
- Hint penalty: level 1 -5, level 2 -5, level 3 -10. Total by hints used: 0, 5, 10, 20.
- `hintsUsed` outside 0-3 is a programming error (validation and the DB check prevent it); scoring throws rather than scoring it.
- Total = sum of components minus hint penalty, clamped to 0-100.

## Explanation quality (AI rubric)

| Quality | Criterion |
| --- | --- |
| 0-2 | No explanation, or the cause is wrong |
| 3-5 | Right area or cause, but no consequence |
| 6-8 | Right cause and consequence |
| 9-10 | Right cause, consequence and edge case, clearly stated |

The AI's `explanation_quality` must be a finite number. The AI output schema rounds it to an integer and clamps it to 0-10 (for example 14.4 becomes 10 and -2 becomes 0). A missing or non-numeric quality makes the output schema-invalid, which is handled like invalid JSON (see "Fallback without the AI"). Scoring clamps the quality to 0-10 again, and a value that is not a finite number scores 0 explanation points.

## Fallback without the AI

Used when the AI is not configured, times out (`AI_TIMEOUT_MS`, 15 s), returns a provider error, fails in any other way, or returns unusable output twice. Unusable means not valid JSON, or valid JSON that fails the output schema. The evaluation retries once on either kind, in any combination. Both tries share one 15 s budget, and the retry is skipped (fallback right away) when less than 1 s of the budget is left. Timeouts and provider errors are not retried. The server also wraps the whole evaluation in an outer guard of `AI_TIMEOUT_MS` + 1 s. If the guard fires, or the result does not match the evaluation result schema, the keyword fallback below is used. Each challenge has three keyword groups (cause, condition, fix). A group matches if the lowercased explanation contains any of its stems. Stems are lowercased too, and blank stems are ignored.

| Groups matched | Quality |
| --- | --- |
| 3 | 10 |
| 2 | 7 |
| 1 | 3 |
| 0 | 0 |

The result is marked `feedbackSource: "fallback"` (`evaluateExplanation()` returns `source: "fallback"`). The `feedback` object has these values:

| Field | Value |
| --- | --- |
| is_correct | `true` when `explanation_quality >= 7`, else `false` |
| explanation_quality | From the table above: 0, 3, 7 or 10 |
| detected_misconception | `null` |
| needs_clarification | `false` |
| hint | `null` |
| feedback | The challenge's `fallback_feedback`; if it is missing or blank, the generic text `Procjena bez AI-ja: objašnjenje je ocijenjeno prema ključnim pojmovima.` |
| practice_tip | `null` |

Known weakness: two matched groups without the cause group (for example condition and fix) still give quality 7 and `is_correct: true`.

## Worked example (find_max)

| Component | Student's answer | Points |
| --- | --- | --- |
| Bug identification | Selected line 2 | 40 |
| Explanation | AI quality 8 | 24 |
| Edge case | `[-8, -3, -10]` -> -3; original returns 0 | 20 |
| Fix | Passes 4 of 4 tests | 10 |
| Hints | Level 1 used | -5 |
| **Total** | | **89** |

This exact case is a required Vitest test.

## Reference implementation

Abridged. This mirrors `server/src/services/scoringService.js`; `scoreLines`, `scoreEdgeCase` and `scoreFix` are defined there and follow the Components table and Rules above.

```js
const HINT_PENALTY = [0, 5, 10, 20]; // total penalty for 0-3 hints used

/** Explanation: round(quality * 3), quality clamped to 0-10, so 0-30. */
export function scoreExplanation(quality) {
  if (typeof quality !== 'number' || !Number.isFinite(quality)) return 0;
  return Math.round(Math.min(10, Math.max(0, quality)) * 3);
}

/** Total hint penalty (positive number) for 0-3 hints used. Throws RangeError otherwise. */
export function hintPenalty(hintsUsed) {
  if (!Number.isInteger(hintsUsed) || hintsUsed < 0 || hintsUsed >= HINT_PENALTY.length) {
    throw new RangeError('hintsUsed must be an integer 0-3');
  }
  return HINT_PENALTY[hintsUsed];
}

export function calculateScore({ attempt, challenge, explanationQuality, edgeCaseCheck, testResults }) {
  const lines = scoreLines(attempt.selectedLines, challenge.bug_lines, challenge.related_lines); // 0, 20, 40
  const explanation = scoreExplanation(explanationQuality);                                    // 0-30
  const edgeCase = scoreEdgeCase(edgeCaseCheck, attempt.edgeCase?.expected);                  // 0, 10, 20
  const fix = scoreFix(testResults, challenge.tests_json, attempt.fixedCode, challenge.code); // 0, 5, 10
  const penalty = hintPenalty(attempt.hintsUsed);
  const total = Math.min(100, Math.max(0, lines + explanation + edgeCase + fix - penalty));
  return {
    total,
    breakdown: { lineIdentification: lines, explanation, edgeCase, fix, hintPenalty: -penalty },
  };
}
```
