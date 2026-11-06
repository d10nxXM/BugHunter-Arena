# BugHunter Arena - System specification

Students get short programs with a deliberate bug. They mark the buggy line, explain the cause and consequence, give an input that exposes the bug, and fix the code. Tests check the behavior; an AI mentor gives hints and judges the explanation. Score: 0-100, of which 70 points are deterministic and 30 come from the AI.

## Users

| Role | In the system | MVP |
| --- | --- | --- |
| Student | Solves challenges, asks for hints, tracks progress | Yes |
| Challenge author (team) | Writes code, tests, hints and bug description as JSON | Yes, internal |
| AI service (external) | Generates hints, evaluates explanations | Yes |
| Teacher | Creates challenges, sees group progress in a teacher panel | No, phase 2 |

Target students: beginner and intermediate programming courses, Python first.

## Flow

1. Student picks a challenge from the list (filter by difficulty and bug category).
2. Challenge screen: task description, expected behavior, code with line numbers. A timer starts.
3. Student can run the visible tests on the original code. They pass, so the bug is not obvious.
4. Student selects one or more suspicious lines.
5. Student writes an explanation: what is wrong, why it happens, what the consequence is.
6. Student gives an edge case: an input and the result correct code would return.
7. Student fixes the code in the editor. "Vrati original" restores it.
8. Optionally asks for hints, up to three levels. Each one costs points.
9. "Predaj odgovor" locks the answer. All tests (visible and hidden) run on the fix in the browser.
10. Server computes the score; AI evaluates the explanation. Student sees score breakdown, test results, AI feedback, the misconception found and a practice tip.
11. Student retries or moves on. The attempt is stored and counts toward progress.

Attempt states: `submitted` then `evaluated`. A submitted answer cannot change; a retry is a new attempt.

## Hints

Hints never contain fixed code. The base hints are written in the challenge; the AI may adapt them to the student's current answer.

| Level | What it does | Example for find_max | Penalty |
| --- | --- | --- | --- |
| 1 | Points at the kind of input | "Does the function work for every list of numbers, or only for typical ones?" | -5 |
| 2 | Names the edge case | "What does the function return if every number in the list is negative?" | -5 |
| 3 | Points at the code | "Look at the starting value of the variable max_value." | -10 |

## Functional requirements

Priority: **Must** = the core flow does not work without it; **Should** = MVP goal; **Could** = later.

| ID | Requirement | Priority |
| --- | --- | --- |
| FR-01 | List challenges with title, language, difficulty and bug category | Must |
| FR-02 | Filter challenges by difficulty and bug category | Could |
| FR-03 | Challenge screen with description, expected behavior, code with line numbers and syntax highlighting | Must |
| FR-04 | Select one or more lines by clicking the line number | Must |
| FR-05 | Enter an explanation of 20-1000 characters | Must |
| FR-06 | Enter an edge case: input and expected result | Must |
| FR-07 | Edit the code and restore the original | Must |
| FR-08 | Run visible tests on the current code before submitting | Should |
| FR-09 | On submit, run all tests on the fix, isolated and with a timeout | Must |
| FR-10 | Show each test: input, expected, actual, status | Must |
| FR-11 | Request hints, up to three levels; record how many were used | Should |
| FR-12 | AI evaluates the explanation and returns structured feedback | Should |
| FR-13 | Without the AI, evaluate the explanation by keyword groups | Must |
| FR-14 | Compute score from four components, total 0-100 | Must |
| FR-15 | Measure time from opening the challenge to submitting | Must |
| FR-16 | Result screen: score breakdown, tests, feedback, practice tip | Must |
| FR-17 | Store every attempt | Should |
| FR-18 | Dashboard: total score, solved challenges, average time, most frequent bug categories | Should |
| FR-19 | Retry a challenge or go to the next one | Must |
| FR-20 | Demo mode (`DEMO_MODE`) with recorded AI responses | Should |
| FR-21 | Enter a display name, no registration | Could |
| FR-22 | Rate how useful the feedback was | Could |
| FR-23 | View attempt history per challenge | Could |

## Non-functional requirements

| ID | Area | Requirement | Target |
| --- | --- | --- | --- |
| NFR-01 | Performance | Challenge list loads | < 2 s |
| NFR-02 | Performance | One challenge's tests run, after Pyodide has loaded | < 3 s |
| NFR-03 | Performance | AI evaluation, with a loading indicator | < 10 s; abort at 15 s and fall back |
| NFR-04 | Reliability | Full flow without manual intervention | 3 consecutive runs clean |
| NFR-05 | Security | User code never runs on the server | Web Worker only, 3 s timeout |
| NFR-06 | Security | API and database keys only on the server | None in client code or repo |
| NFR-07 | Security | Request size and AI call limits | 50 KB per request; 100 API requests and 20 AI calls per IP per 10 min |
| NFR-08 | Integrity | Solution, bug lines and hidden tests not in the browser before submit | Verified in DevTools |
| NFR-09 | Usability | New user finishes a first challenge without instructions | Test user, < 10 min |
| NFR-10 | Usability | English UI, plain error messages | All messages in English |
| NFR-11 | Compatibility | Current Chrome, Firefox, Edge on laptop and desktop | Checked on all three |
| NFR-12 | Accessibility | Contrast, keyboard use, status not by color alone | Text contrast >= 4.5:1 |
| NFR-13 | Maintainability | New challenge is a JSON file, no app code change | < 15 min per challenge |

## Bug categories

The English names are the exact `bug_category` values used in challenge files and API responses. All names below were confirmed by the user on 2026-11-05 and translated to English with the user's approval on 2026-11-06. A new category name needs the user's confirmation before a challenge uses it.

| Category | Status | Typical example |
| --- | --- | --- |
| Wrong initialization | Official (`find-max.json`) | Maximum starts at 0 instead of the first element |
| Boundary condition | Official, no challenge yet | `<` instead of `<=` at the edge of a range |
| Off-by-one error | Official (`binary-search.json`) | Loop stops one step early (off-by-one) |
| Wrong operator | Official, no challenge yet | `//` instead of `/` |
| Condition order | Official, no challenge yet | General condition checked before the specific one |
| Modifying a collection while iterating | Official (`remove-negatives.json`) | Removing from the list the loop walks over |
| Default function behavior | Official, no challenge yet | JavaScript `sort()` compares numbers as text |

## Challenge set

| # | Challenge | Language | Category | Difficulty | Priority |
| --- | --- | --- | --- | --- | --- |
| 1 | find_max - largest element (demo) | Python | Wrong initialization | easy | Must |
| 2 | remove_negatives | Python | Modifying a collection while iterating | medium | Must |
| 3 | binary_search | Python | Off-by-one error | hard | Must |
| 4 | count_in_range | Python | Boundary condition | easy | Should |
| 5 | average | Python | Wrong operator | easy | Should |
| 6 | fizzbuzz | Python | Condition order | easy | Should |
| 7 | topThree | JavaScript | Default function behavior | medium | Could |

Challenges 1-3 are in `server/data/challenges/` (`find-max`, `remove-negatives`, `binary-search`).

How the bug shows in the three Must challenges:

- find_max: `max_value = 0`, so `[-8, -3, -10]` returns 0 instead of -3.
- remove_negatives: `numbers.remove(x)` inside the loop skips the next element, so `[-1, -2, 3]` returns `[-2, 3]` instead of `[3]`.
- binary_search: `while low < high`, so searching 9 in `[1, 3, 5, 7, 9]` returns -1 instead of 4.

## Screens

| Screen | Main elements | Actions |
| --- | --- | --- |
| Challenge list | Cards with title, language, difficulty, category, best score; total score in header | Pick challenge, filter, open progress |
| Challenge | Left: description and editor. Right: explanation, edge case, hints. Timer in header | Select lines, edit code, run visible tests, hint, submit |
| Result | Total and per-component score, test table, AI feedback (labelled), misconception, tip | Retry, next challenge, rate feedback |
| Progress | Total score, solved, average time, score per challenge, top 3 bug categories | Back to challenges |

## Out of scope for the MVP

- Registration and role management.
- Many languages or generated challenges.
- Leaderboards, multiplayer, advanced analytics.
- Running user code on a server.

## Known limitations

- Test results, time and hint count come from the browser and can be tampered with. Fine for practice; exams would need server-side isolated execution.
- AI evaluation can be wrong, which is why it is capped at 30 points.
- The keyword fallback is coarse and does not understand sentences.

## Roadmap

| Phase | Focus | Features |
| --- | --- | --- |
| 1. MVP | One complete, stable flow | 5-8 Python challenges, browser tests, AI mentor, scoring, dashboard |
| 2. Classroom pilot | Teachers and groups | Teacher panel, login, JavaScript, more difficulty levels, server-side isolated test execution |
| 3. Platform | Personalization | Challenge sets based on a student's typical mistakes, classroom competitions, GitHub Classroom and LMS integration |
