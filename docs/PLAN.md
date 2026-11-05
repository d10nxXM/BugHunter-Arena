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
| M1 client shell | Merged (2026-11-04) | Routes, API client with mocks matching `docs/API.md`, providers, stubs at D's paths, tooling. Pyodide 314.0.7, Monaco 0.57.0, react-router, Tailwind 4, Vitest. jsx-a11y deferred (no ESLint 10 support). Frontend follow-ups are listed under "Frontend follow-ups (open)" below |
| M2 frontend D, E and F | Merged | Editor and runner (D), challenge flow (E), results and progress (F). Tip of `main`: aa4cbe0. Open items are under "Frontend follow-ups (open)" |
| M3 Integration | Complete (2026-11-05) | The client uses the real API (`VITE_USE_MOCKS=false`). `npm test` in `e2e/` passes 7/7 against the real server and Supabase: solve, hints, infinite loop, dashboard and validation in demo mode, plus the AI fallback with an unreachable LLM. The suite does not clean up the attempts and display names it creates |

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
- `client/src/App.jsx` with all routes: ChallengeList, ChallengePage, ResultView, Dashboard, and NotFound (`*`). The pages are placeholders with an `<h1 tabIndex={-1}>`. `paths.js` holds the route paths and the `ResultState` that ResultView reads.
- `client/src/components/Layout.jsx` (header, navigation, skip link, Suspense, focus on the new page's h1 after navigation) and `ErrorBoundary.jsx` (Montenegrin fallback, keyed by pathname).
- `client/src/context/` (`UserProvider`, `bha.user` in localStorage) with `hooks/useUser.js`, and `hooks/usePageTitle.js`.
- `client/src/components/TestRunnerProvider.jsx` and `client/src/hooks/useTestRunner.js` (the context and hook), plus a stub `client/src/components/CodeEditor.jsx`. The runner stub is never ready and its `run()` rejects. Worker D replaces these.
- `client/src/api/client.js`: one function per endpoint in `docs/API.md`, `ApiError` codes, and timeouts (10 s default, 12 s hints, 20 s evaluation). `client/src/api/mocks/` answers every call when `VITE_USE_MOCKS=true`. Its fixtures match every example in `docs/API.md`, and `mocks.test.js` fails on drift.
- Tooling: `client/scripts/copy-pyodide.mjs` (`npm run pyodide:copy`, run before dev and build), Vitest with jsdom, ESLint, Prettier, and the Vite `/api` proxy to `:3000`.
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
| D Editor and runner | test-runner | `workers/` (including `runnerClient.js`, `harness.js`, `monacoSetup.js`), `hooks/useTestRunner.js`, `components/TestRunnerProvider.jsx` (new), `components/CodeEditor.jsx`, `lib/compareResults.js` | Pages, `App.jsx`, `api/`, the M1 shell files (see Shared files) |
| E Challenge flow | frontend-dev | `pages/ChallengeList.jsx`, `pages/ChallengePage.jsx`, `components/AnswerForm.jsx`, `components/HintPanel.jsx`, `components/ChallengeCodePanel.jsx`, `components/ChallengeHooks.js`, `components/ChallengeSubmissionOutcome.jsx`, `components/ChallengeTestSummary.jsx`, `components/ChallengeTimer.jsx`, `components/ChallengeWorkspace.jsx`, `hooks/useHints.js`, `hooks/useRunnerGate.js`, `hooks/useSubmitFlow.js`, `lib/answerValidation.js`, `lib/attemptRecovery.js`, `lib/runnerPayload.js`, `lib/submitConstants.js`, `lib/submitErrors.js`, `lib/submitSteps.js` | `App.jsx`, `api/`, D's files |
| F Results and progress | frontend-dev | `pages/ResultView.jsx`, `pages/Dashboard.jsx`, `components/ScoreBreakdown.jsx`, `components/TestResults.jsx`, `components/ProgressHistory.jsx`, `components/ProgressNameForm.jsx`, `components/ProgressRemoveConfirm.jsx`, `components/ProgressSummary.jsx`, `components/ResultFeedback.jsx`, `components/UserProgress.jsx`, `hooks/useUserProgress.js`, `lib/progressFormat.js` | `App.jsx`, `api/`, D's and E's files |

`client/src/test-utils/fakeMonaco.js` is a shared test helper (a Monaco stub for component tests, used by `App.test.jsx` and `ChallengePage.test.jsx`). No area owns it.

`public/pyodide/` is generated by `npm run pyodide:copy` (runs on predev and prebuild) from the `pyodide` npm package and is gitignored. D owns how the runner uses it, not its contents.

E and F may read but not edit `client/src/paths.js`, `hooks/useUser.js`, `context/*`, `components/Layout.jsx`, `components/ErrorBoundary.jsx` and `hooks/usePageTitle.js`. If a change is needed, they say so in their summary.

The shell ships stubs at D's paths: `hooks/useTestRunner.js` and `components/TestRunnerProvider.jsx` (the runner stub reports `ready: false` with `loadError`, and `run()` rejects), and `components/CodeEditor.jsx` (a textarea with a line-number gutter). E imports the real paths from day one, through the interfaces in `.claude/agents/test-runner.md`. D replaces the stubs.

### Frontend follow-ups (open)

Found in the M1 shell review. They apply to the M2 workers unless marked otherwise.

- [x] D: `loadPyodide` gets `indexURL` and `packageBaseUrl` set to the local `/pyodide/`. Never `loadPackage` or `micropip`, which fall back to the jsdelivr CDN.
- [x] D: Monaco comes from the local `monaco-editor` package through `workers/monacoSetup.js`, with only the Python language and `editor.worker` (a Vite `?worker` import). `@monaco-editor/react` is not used. Never put AI or student text in Monaco hovers, markers or markdown.
- [x] D: the `dist` check. `grep -rl jsdelivr dist/assets` is empty on main (verified 2026-11-04, with Monaco bundled locally).
- [x] E and F: every page renders exactly one `<h1 tabIndex={-1}>`, also while its data loads, so focus has a target after navigation.
- [x] E (M2): POST timeout handling in `ChallengePage.jsx`, per `docs/API.md` "Timeouts and retries". Anonymous submits (no `userId`) are allowed.
  - Treat `createAttempt` and `submitEvaluation` errors with code `TIMEOUT`, `NETWORK_ERROR`, `HTTP_ERROR` or `BAD_RESPONSE`, or with status 500 or above, as "maybe saved". An `AbortError` is not.
  - `createAttempt`: show "Predaja možda nije stigla do servera. Pokušaj ponovo." with a manual retry button. No automatic retry.
  - Evaluation timeout or `409`: if a `userId` exists, page `GET /api/attempts?userId=&challengeId=` with `cursor` and `cursorId` until `id === attemptId` is found or the list ends (never "newest"). If the match is evaluated, show the score inline in ChallengePage with a link to `/progress` (no ResultView). Otherwise re-POST at most once. If that still fails, or there is no `userId`, show "Rezultat je možda sačuvan, ali ga nismo mogli učitati.".
  - Tests for each of these cases.
- [ ] M4: jsx-a11y is deferred. Add it once its peer dependencies accept ESLint 10.
- [ ] M4: accepted risk. The `monaco-editor` 0.57.0 vendored `dompurify` has an advisory. It is not reachable because Monaco never renders untrusted text (see `client/README.md`, Audit notes). Re-check when Monaco ships `dompurify` 3.4.17 or later.
- [ ] M3/M4 (later): `GET /api/attempts/:id` with the summary plus `feedback`, `testsPassed` and `testsTotal`, and no hidden fields. It recovers feedback text and anonymous attempts, which the list endpoint cannot. This endpoint is not in `docs/API.md` yet, so the planner adds it first. Idempotency keys only if duplicate submissions become a problem.
- [ ] M4: track the `monaco-editor` `dompurify` advisory (the accepted risk above is still open). When a Monaco release ships `dompurify` 3.4.17 or later, bump `monaco-editor`, then re-check `client/README.md` Audit notes.
- [ ] M4: CSP at deployment, which the repo does not set yet: `connect-src 'self'` plus the API origin, and `worker-src 'self' blob:`.
- [x] M4: e2e coverage of a real infinite-loop timeout in the browser. Done in `e2e/infinite-loop.spec.js` (journey 4), passing 2026-11-05.
- [x] M4: split `hooks/useSubmitFlow.js` (225 lines) and `pages/ChallengePage.test.jsx` (1004 lines). Done: `hooks/useSubmitFlow.js` (orchestration) + `hooks/useEvaluationStep.js` (evaluation POST and recovery) + `lib/submitDecisions.js` (pure retry/recovery decisions, tested in `lib/submitDecisions.test.js`). The page tests are `pages/ChallengePage.{loading,hints,visibleTests,submit,recovery}.test.jsx` with shared setup in `test-utils/challengePageSetup.jsx` and `test-utils/ResultProbe.jsx`.
- [x] M4: move `components/ChallengeHooks.js` to `hooks/`. Done: `hooks/useUnmountSignal.js` and `hooks/useFocusRequest.js`.
- [ ] A hint that arrives after the answer is locked is dropped silently (`hooks/useHints.js`). The student sees nothing for it.
- [ ] Waiting for a user decision: the client-side "solved" label.
- [ ] Waiting for a user decision: Montenegrin labels for weak categories.

## Shared files

| File | Who may change it | When |
| --- | --- | --- |
| `docs/API.md`, `docs/SCORING.md`, `docs/DATA_MODEL.md` | planner, then docs-sync | Before M2, or between batches |
| `server/src/app.js` | M1 only | Never during M2 |
| `client/package.json`, `client/package-lock.json`, `client/vite.config.js`, `client/eslint.config.js`, `client/index.html`, `client/.env.*`, `client/src/main.jsx`, `client/src/App.jsx`, `client/src/index.css`, `client/src/paths.js`, `client/src/components/Layout.jsx`, `client/src/components/ErrorBoundary.jsx`, `client/src/context/*`, `client/src/hooks/useUser.js`, `client/src/hooks/usePageTitle.js`, `client/src/api/**` (`client.js` and mocks) | M1 only, frozen during M2 | Never during M2. Workers name a needed change in their summary instead |
| `package.json`, `package-lock.json` | M1, or between batches by user decision (for example `validate:challenges` and `eval` were added after batch 1) | Never during a batch. Workers still name a needed dependency in their summary instead of installing it. |
| `supabase/migrations/` | One worker per batch, named in the batch prompt | Pushed after merge |

## Running a batch

Run at most three workers at a time; each one multiplies usage.

Backend: batch 1 was A alone. Backend batch 2 is B and C in parallel, merged B then C. Frontend workers D, E and F run later in the frontend tree.

Suggested batches (superseded for the backend, see above):

1. A, B, D (core data and the runner)
2. C, E, F (mentor and the screens)

After each batch: `code-reviewer` on every branch, merge one at a time, run tests on `main` after each merge, then start the next batch from the updated `main`.
