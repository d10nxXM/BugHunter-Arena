# BugHunter Arena - Build plan

The work is split so several agents can run at once without editing the same files. Each worker owns a set of files; shared files are settled before parallel work starts.

## Milestones

| Milestone | Mode | Contents | Done when |
| --- | --- | --- | --- |
| M1 Foundation | One agent at a time | Server foundation; client shell; route and page stubs | `main` runs, both shells start, stubs registered |
| M2 Features | Parallel workers A-F | Everything in the worker tables below | Each worker's branch reviewed and merged |
| M3 Integration | One agent | Replace client mocks with the real API; full find_max flow | Solve journey passes end to end |
| M4 Hardening | Parallel reviewers | e2e journeys, security review, AI evaluation set, more challenges | Verification loop READY |

## Status

| Item | State | Notes |
| --- | --- | --- |
| Backend batch 1 (A) | Merged | Challenges and written hints |
| Backend batch 2 (B and C) | Merged | B first, then C. B: attempts, evaluation, scoring, progress, users. C: AI mentor, AI hints, demo mode, eval set. No migration |
| M2 backend | Complete | `npm test` in `server/` passes on `main` after batch 2 |
| Backend follow-up | Done | AI quota counts LLM-calling requests only, demo hint source, validation before aiLimiter, attempts index and pagination, cleanup |
| Backend contract follow-up (cursorId paging, hint contract tests) | Merged, migration pushed, paging verified on production | C then B, 2026-11-04. Migration 20261104090000 pushed to production; manual paging check passed |
| Production data | Seeded | find-max loaded with `npm run seed`, 2026-11-04 |
| M1 client shell | Not done | `client/` is still the Vite template; planning in progress. Must land before frontend batch D, E, F |

Backend remaining before M3:

- [x] Push `supabase/migrations/20261104090000_attempts_user_created_at_id_idx.sql` with `npx supabase db push --remote` (`20261103120000` is already applied on production and stays unchanged). Done 2026-11-04. With the current Supabase CLI, `db push` and `migration list` need `--remote`; without it they target a local Docker stack.
- [x] Manual tied-createdAt paging check against production. Done 2026-11-04: a test user with 3 attempts sharing `created_at` `2026-11-04 10:00:00.123456+00`, paged with `limit=1` using `cursor` + `cursorId`. Each attempt came back once, in order, then an empty page. Microseconds preserved. Test data deleted.
- [x] Fix `LLM_MODEL` for the Gemini key and run `npm run eval`, then record the table. Done, see the run below.
- Contract items for planner (all decided 2026-11-03):
  - Hint order: not enforced on the server. Hints are practice-grade; any `level` 1-3 is served.
  - Attempts paging: add optional `cursorId` next to `cursor`. `cursor` alone keeps its strict `<` behaviour for compatibility.
  - SCORING.md reference block: aligned with `scoringService.js`, with the clamp and finite check. An out-of-range `hintsUsed` throws. No behaviour change.
  - [x] Code follow-up: area B implements `cursorId` paging and edits the unpushed index migration; area C adds hint-contract tests. Done and merged. The push and the manual check above are done (2026-11-04).
- Later migration: drop the now-redundant `attempts_user_id_idx`.

First AI evaluation run (`npm run eval` in `server/`), 2026-11-03:

- Model: `gemini-3.5-flash-lite` (Gemini OpenAI-compatible endpoint). Runs per case: 3.
- `gemini-2.5-flash-lite` is listed for the key but returns 404 with an empty body, so it is not used. `gemini-flash-lite-latest`, `gemini-3.5-flash-lite`, `gemini-3.1-flash-lite` and `gemini-3.5-flash` all answered.

| case | expected | scores | result |
| --- | --- | --- | --- |
| full-cause-consequence-edge | 9-10 is_correct=true | 10, 10, 10 | PASS |
| cause-without-consequence | 3-5 | 4, 4, 4 | PASS |
| right-line-wrong-cause | 0-2 is_correct=false | 1, 1, 1 | PASS |
| vague-one-word | 0-2 needs_clarification=true | 0, 0, 0 | PASS |
| injection | 0-2 is_correct=false | 0, 0, 0 | PASS |
| spelling-mistakes | 6-10 | 8, 8, 8 | PASS |

Result: ALL PASS.

## M1: what must exist before parallel work

Server foundation (first Claude Code task):
- `app.js`, `index.js`, config, AppError, error and validation middleware, rate limits
- Supabase client, seed script, `GET /api/health`, `GET /api/challenges`, `GET /api/challenges/:id`

Shell completion (so M2 workers never edit shared files):
- `server/src/app.js` registers every router: challenges, hints, attempts, progress, users. Routers not built yet returned `501 NOT_IMPLEMENTED` until built in M2.
- `server/src/services/evaluationService.js` stub exporting `evaluateExplanation()` that returns the fallback shape.
- `client/src/App.jsx` with all routes and placeholder pages: ChallengeList, ChallengePage, ResultView, Dashboard.
- `client/src/api/client.js` and `client/src/api/mocks/` matching every example in `docs/API.md`.
- Every dependency the workers will need is installed in both `package.json` files.

## M2 workers

### Backend

| Worker | Agent | Owns | Must not touch |
| --- | --- | --- | --- |
| A Challenges and hints | backend-dev | `routes/challenges.js`, `routes/hints.js` (batch 1 only; moves to C in batch 2), `db/challenges.js`, `services/challengeService.js`, `schemas/challenge*.js`, `scripts/seed.js`, `scripts/validate-challenges.js`, `data/challenges/` | `app.js`, attempts, AI services |
| B Attempts and scoring | backend-dev + tdd-guide | `routes/attempts.js`, `routes/progress.js`, `routes/users.js`, `routes/users.test.js`, `db/attempts.js`, `db/users.js`, `services/scoringService.js`, `services/attemptService.js`, `schemas/attempt.js`, `test/fakeSupabase.js`, `test/integration.test.js` (batch 2) | `app.js`, AI services, `docs/SCORING.md`, `db/challenges.js` (calls `getFullChallenge` only) |
| C AI mentor | ai-integration | `services/llmClient.js`, `services/hintService.js`, `aiService.js`, `evaluationService.js`, `fallbackService.js`, `schemas/aiOutput.js`, `prompts/`, `data/demo-responses.json`, `eval/`, `scripts/run-eval.js`, `routes/hints.js` (batch 2, from A) | Routes except `routes/hints.js` in batch 2, scoring, db, `services/challengeService.js` (C only calls `getWrittenHint`), `test/fakeSupabase.js`, `test/integration.test.js` |

C keeps its tests next to its own files (for example `services/hintService.test.js`) and mocks `getFullChallenge` at module level instead of editing shared test files.

Batch 2 adds no tables: progress and attempt history are computed from the existing `attempts` table. Batch 2 has no migration; `supabase/migrations/` is untouched.

B calls `evaluateExplanation()` from C's interface; until C is merged, the M1 stub returns the fallback shape.

B applies `aiLimiter` to `POST /api/attempts/:id/evaluation` when building it.

A added a server-only `getFullChallenge(id)` in `db/challenges.js`. It returns the full challenge row, hidden fields included. It may be called only from `services/attemptService.js` (B) and `services/hintService.js` (C). No route touches the full row; an integration tripwire test enforces this.

A shipped written hints only (`source: "written"`). In batch 2, `routes/hints.js` calls `services/hintService.js` (C). hintService loads the full row with `getFullChallenge`, calls `aiService.getHint(context, level)`, and falls back to `challengeService.getWrittenHint()` when the AI is unavailable, times out, or returns a hint that contains a line of the reference solution. Ownership of `routes/hints.js` moves from A to C for that batch. Written hints use the general API limit (100 per 10 min per IP). C restores `aiLimiter` (20 per 10 min per IP) on the hints route when it wires AI hints in batch 2. Since the backend follow-up, both AI routes use `aiLimiter`, but only requests that call the LLM use the AI quota (see docs/API.md, Rate limits).

C's LLM access uses Node's built-in `fetch` to an OpenAI-compatible chat-completions endpoint, configured by `LLM_API_URL`, `LLM_MODEL` and `LLM_API_KEY` in `server/.env`. Only `services/llmClient.js` (C) knows the provider, and `llmClient.js` is called only by `aiService.js`. No SDK.

`server/package.json` has `npm run eval` (`node scripts/run-eval.js`). It is added between batches 1 and 2, so C does not touch `package.json`.

### Frontend

| Worker | Agent | Owns | Must not touch |
| --- | --- | --- | --- |
| D Editor and runner | test-runner | `workers/`, `hooks/useTestRunner.js`, `lib/compareResults.js`, `components/CodeEditor.jsx`, `public/pyodide/` | Pages, `App.jsx`, `api/` |
| E Challenge flow | frontend-dev | `pages/ChallengeList.jsx`, `pages/ChallengePage.jsx`, `components/AnswerForm.jsx`, `components/HintPanel.jsx` | `App.jsx`, `api/`, D's files |
| F Results and progress | frontend-dev | `pages/ResultView.jsx`, `pages/Dashboard.jsx`, `components/ScoreBreakdown.jsx`, `components/TestResults.jsx` | `App.jsx`, `api/`, D's and E's files |

E uses D's `<CodeEditor>` and `useTestRunner()` through the interfaces in `.claude/agents/test-runner.md`. Until D is merged, E uses a temporary `<textarea>` and a mocked `useTestRunner`.

## Shared files

| File | Who may change it | When |
| --- | --- | --- |
| `docs/API.md`, `docs/SCORING.md`, `docs/DATA_MODEL.md` | planner, then docs-sync | Before M2, or between batches |
| `server/src/app.js`, `client/src/App.jsx` | M1 only | Never during M2 |
| `package.json`, `package-lock.json` | M1, or between batches by user decision (for example `validate:challenges` and `eval` were added after batch 1) | Never during a batch. Workers still name a needed dependency in their summary instead of installing it. |
| `supabase/migrations/` | One worker per batch, named in the batch prompt | Pushed after merge |

## Running a batch

Run at most three workers at a time; each one multiplies usage.

Backend: batch 1 was A alone. Backend batch 2 is B and C in parallel, merged B then C. Frontend workers D, E and F run later in the frontend tree.

Suggested batches (superseded for the backend, see above):

1. A, B, D (core data and the runner)
2. C, E, F (mentor and the screens)

After each batch: `code-reviewer` on every branch, merge one at a time, run tests on `main` after each merge, then start the next batch from the updated `main`.
