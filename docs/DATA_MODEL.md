# BugHunter Arena - Data model

Three tables in Supabase (PostgreSQL): `challenges`, `attempts`, and the optional `users`. One challenge has many attempts; one user has many attempts.

Challenge JSON files in `server/data/challenges/` are the source of truth. `server/scripts/seed.js` (`npm run seed` in `server/`) checks every file against `ChallengeFileSchema` and checks that the file name matches the id, then upserts all of them into `challenges` in one call. If any file is invalid, nothing is written. The seed does not run the extra checks of `validate-challenges` (see Validation rules).

The schema is applied through migrations in `supabase/migrations/`, pushed with `npx supabase db push --remote` after the PR is merged to `main` (without `--remote` the CLI targets a local Docker stack). The SQL below is the schema after all migrations (see the Migrations table); later changes are new migration files, and this document is updated in the same PR.

## SQL schema

```sql
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now(),
  -- 20261106200000_user_accounts.sql: accounts. Guests have both null.
  auth_user_id uuid unique references auth.users (id),
  handle text unique constraint users_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  bio text constraint users_bio_length check (char_length(bio) <= 280),
  constraint users_account_pair check ((auth_user_id is null) = (handle is null))
);

create table challenges (
  id text primary key,
  title text not null,
  description text not null,
  language text not null check (language in ('python', 'javascript')),
  function_name text not null,
  code text not null,
  bug_lines int[] not null,
  related_lines int[] not null default '{}',
  bug_category text not null,
  bug_description text not null,
  reference_solution text not null,
  -- 20261106120000_challenges_difficulty_english.sql
  difficulty text not null constraint challenges_difficulty_check check (difficulty in ('easy', 'medium', 'hard')),
  tests_json jsonb not null,
  hints_json jsonb not null,
  keywords_json jsonb not null,
  fallback_feedback text not null,
  created_at timestamptz not null default now()
);

create table attempts (
  id uuid primary key default gen_random_uuid(),
  challenge_id text not null references challenges(id),
  user_id uuid references users(id),
  selected_lines int[] not null,
  explanation text not null,
  edge_case jsonb not null,
  fixed_code text not null,
  hints_used int not null default 0 check (hints_used between 0 and 3),
  status text not null default 'submitted' check (status in ('submitted', 'evaluated')),
  test_results jsonb,
  score int check (score between 0 and 100),
  score_breakdown jsonb,
  ai_feedback jsonb,
  feedback_source text check (feedback_source in ('ai', 'fallback', 'demo')),
  feedback_rating smallint check (feedback_rating between 1 and 5),
  duration int check (duration >= 0),
  created_at timestamptz not null default now()
);

create index attempts_user_id_idx on attempts (user_id);
create index attempts_challenge_id_idx on attempts (challenge_id);
-- 20261104090000_attempts_user_created_at_id_idx.sql
create index attempts_user_id_created_at_idx on attempts (user_id, created_at desc, id desc);

alter table users enable row level security;
alter table challenges enable row level security;
alter table attempts enable row level security;
-- No policies: only the server's service key reads and writes these tables.
```

Migrations:

| File | Change |
| --- | --- |
| `20261103002608_init_schema.sql` | Initial schema |
| `20261103120000_attempts_user_created_at_idx.sql` | Index `attempts_user_id_created_at_idx` on `attempts (user_id, created_at desc)` for history and progress reads. Applied to production; not changed since |
| `20261104090000_attempts_user_created_at_id_idx.sql` | Drops and recreates `attempts_user_id_created_at_idx` on `attempts (user_id, created_at desc, id desc)`, so the index follows the composite `(created_at, id)` cursor of `GET /api/attempts` |
| `20261106200000_user_accounts.sql` | Accounts: adds `users.auth_user_id` (unique, references `auth.users`), `users.handle` (unique, `^[a-z0-9_]{3,20}$`), `users.bio` (at most 280 characters, unused until profile editing ships) and the check `users_account_pair` (both `auth_user_id` and `handle` set, or both null). Additive only, safe to push before the code deploys |
| `20261106120000_challenges_difficulty_english.sql` | Drops the old difficulty check (`challenges_difficulty_check`, plus any check on `challenges` that still lists `lako`), maps existing rows `lako`/`srednje`/`teško` to `easy`/`medium`/`hard`, and adds `challenges_difficulty_check` for `easy`, `medium`, `hard`. Run `npm run seed` afterwards to load the English challenge text |
| `20261112090000_leaderboard.sql` | Adds the SQL function `leaderboard_xp()` (see "Derived data for the leaderboard"). `execute` is revoked from `public`, `anon` and `authenticated` and granted only to `service_role`. No tables or columns change |

## User columns

- A row with `auth_user_id` and `handle` is an **account**; a row with both null is a **guest**. `display_name` of an account equals its handle.
- `email` and the password live only in Supabase Auth (`auth.users`). They are never copied into public tables, returned by the API, logged or sent to the LLM.
- Signup with `claimUserId` turns a guest row into an account with one conditional update (`where id = :claimUserId and auth_user_id is null`), so the guest's attempts move with it. A row is claimed at most once.
- Account deletion is out of scope. `auth_user_id` uses the default `on delete restrict`.

## Attempt columns

- `duration`: seconds from opening the challenge to submitting. It is the request's `durationSec`, rounded to an integer and capped at 2147483647.
- `test_results`: the `testResults` array of the evaluation request as validated. Up to 100 items `{ id, passed, actual?, error? }`, with unknown keys dropped.
- `score_breakdown`: `{ lineIdentification, explanation, edgeCase, fix, hintPenalty }`. `hintPenalty` is 0 or negative (`docs/SCORING.md`).
- `ai_feedback`: the seven feedback fields `{ is_correct, explanation_quality, detected_misconception, needs_clarification, hint, feedback, practice_tip }`. The source is stored separately in `feedback_source` (`ai`, `fallback` or `demo`).
- `test_results`, `score`, `score_breakdown`, `ai_feedback` and `feedback_source` are `null` while `status` is `submitted`. They are all set in one conditional update that also sets `status = 'evaluated'`, and only if the attempt is still `submitted`.
- `feedback_rating` is not written by any endpoint yet (FR-22).

## Challenge JSON format

One file per challenge, `server/data/challenges/<id>.json`. Field names match the `challenges` columns.

| Field | Type | Meaning |
| --- | --- | --- |
| id | string | Readable id, e.g. `find-max` |
| title, description | string | Shown to the student (English) |
| language | `python` \| `javascript` | |
| function_name | string | Function the tests call |
| code | string | Buggy code |
| bug_lines | int[] | 1-based lines that contain the bug |
| related_lines | int[] | Lines that earn partial credit |
| bug_category | string | Exact English category name from the Bug categories table in `docs/SPEC.md`, e.g. `Wrong initialization` |
| bug_description | string | Cause and consequence; ground truth for the AI |
| reference_solution | string | Correct code, same signature |
| difficulty | `easy` \| `medium` \| `hard` | |
| tests_json | array | `{ id, args, expected, visible, failsOnOriginal }`. `failsOnOriginal` is `true` when the test fails on the buggy `code` and passes on `reference_solution` |
| hints_json | string[3] | Written hints for levels 1-3, in English |
| keywords_json | string[][] | Three groups of lowercase English word stems for the fallback evaluation (cause, triggering condition, fix) |
| fallback_feedback | string | English feedback text shown when the AI is unavailable |

`args` is the JSON array of arguments the function is called with. Python `None` is JSON `null`.

`tools/check-challenge.py` computes and writes `failsOnOriginal`. It is an author tool at the repo root, run with `python tools/check-challenge.py <challenge.json> [...]` using the author's local Python 3 (standard library only). Python challenges only. It runs the buggy `code` and the `reference_solution` on every test. All tests for one code string (the buggy code, or the reference solution) run in one isolated Python process with one 3 s budget for the whole run, like the browser client. If the run times out, every test in it counts as failed. The process tree is killed and the child gets a minimal environment (no secrets from the author's shell). It checks three things: every visible test passes on the buggy code, at least one hidden test fails on the buggy code, and the reference solution passes all tests. If all three hold, it writes `failsOnOriginal` into each test. Each file is checked on its own. A file that fails a check is not written. The exit code is 1 if any file fails. The tool writes each file atomically and rejects duplicate test ids. It runs trusted challenge code on the author's machine only; nothing in `server/` may import or run it, and a text tripwire test in `server/test/integration.test.js` enforces this.

`npm run validate:challenges` in `server/` runs `server/scripts/validate-challenges.js`. It checks structure only and never runs code. It checks only that the flag is present and plausible (see Validation rules). It prints every problem with its file name and exits with code 1 if any file is invalid.

## Validation rules

Enforced by `ChallengeFileSchema` in `server/src/schemas/challenge.js` (used by the seed and by validate-challenges) and by the extra checks in `server/scripts/validate-challenges.js`.

Files:
- Every `.json` file in `server/data/challenges/` must be valid JSON, and the directory must hold at least one file.
- The file name must equal `<id>.json`.
- No unknown fields, either at the top level or inside a test. Every top-level field in the table above is required.

Fields (schema):
- `id`: 1-64 characters, lowercase letters, digits and hyphens only (`^[a-z0-9-]{1,64}$`).
- `title`, `description`, `function_name`, `code`, `bug_category`, `bug_description`, `reference_solution`, `fallback_feedback`: non-empty strings.
- `fallback_feedback`: at most 2000 characters.
- `language`: `python` or `javascript`. `difficulty`: `easy`, `medium` or `hard`.
- `bug_lines`: at least one entry. `related_lines`: required but may be empty. Both hold positive integers.
- `tests_json`: each test is `{ id, args, expected, visible, failsOnOriginal? }`. `id` is a non-empty string, `args` is an array of JSON values, `expected` is any JSON value, `visible` is a boolean, and `failsOnOriginal` is an optional boolean in the schema. At least 2 visible tests and at least 1 hidden test. Test ids are unique within the challenge.
- `hints_json`: exactly 3 non-empty strings, for levels 1-3.
- `keywords_json`: exactly 3 groups, each with at least one non-empty stem.

Extra checks (validate-challenges only, not the seed):
- Every `bug_lines` and `related_lines` number is at most the number of lines in `code`. A trailing newline at the end of `code` is not counted as a line.
- Every test has a boolean `failsOnOriginal`.
- At least one hidden test has `failsOnOriginal: true`.
- The visible tests do not all have `failsOnOriginal: true`.

Behavior checks (tools/check-challenge.py, author tool; not run by the seed or validate-challenges):
- Every visible test passes on the buggy `code`.
- At least one hidden test fails on the buggy `code`.
- The `reference_solution` passes all tests.

Not checked: that `bug_category` is in the SPEC list, duplicate or overlapping line numbers, and the content of hints and stems (lowercase, no fix). The three behavior checks above are done only by `tools/check-challenge.py`, not by the seed or the validator.

See `server/data/challenges/find-max.json` for a complete example.

## Derived data for the dashboard

Computed by `computeProgress` in `server/src/services/attemptService.js` from the user's newest 1000 attempts, read newest first.

- **Best attempt** of a challenge: the evaluated attempt with the highest score. On a tie the newest wins. Submitted attempts that are not evaluated are never the best attempt.
- **Attempted**: the number of distinct challenges with at least one attempt, evaluated or not.
- **Per challenge**: one entry per attempted challenge, sorted by challenge id. `bestScore` is the best attempt's score, or 0 if the challenge has no evaluated attempt. `attempts` counts all attempts, evaluated or not.
- **Solved challenge**: its best attempt has a score of at least 70.
- **Total score**: the sum of `bestScore` over attempted challenges, so retries do not inflate it.
- **averageDurationSec**: the mean `duration` of the best attempt of each solved challenge, rounded to whole seconds. A missing duration counts as 0. It is 0 if no challenge is solved.
- **Weak categories**: each evaluated attempt whose challenge has a known category is a miss for that category when `score_breakdown.lineIdentification < 40` or its score is under 70. A selection of related lines only scores 20, so it counts as a miss. Categories are sorted by misses, most first, with ties in alphabetical order. The top 3 are returned as `{ category, misses }`. Categories with no misses are not listed.
- **XP**: `perChallenge[].xp` and `totalXp`, see `docs/SCORING.md`, "XP and ranks". XP is read from the same newest 1000 attempts, so a first solve older than that is not seen.
- A user with no attempts gets zeros and empty lists.

## Derived data for the leaderboard

`leaderboard_xp()` (migration `20261112090000_leaderboard.sql`) returns one row per account with at least one solve: `handle`, `total_xp`, `solved` and `reached_at`.

- A **first solve** is, per user and challenge, the evaluated attempt with a score of at least 70 that has the oldest `created_at`, then the smallest id. Same rule as `computeXp` in `server/src/services/scoringService.js`.
- `total_xp` is the sum of the first-solve scores, `solved` their count and `reached_at` the newest first-solve `created_at`.
- It reads all attempts, not the newest 1000. Guests (`handle` null) are left out.
- Rows come back best first (`total_xp` desc, `reached_at`, `handle`). PostgREST cuts an rpc result at its `max-rows` (1000 on Supabase), so past 1000 ranked accounts the bottom of the board has no position; the server logs a warning when that can happen.
- The server orders and numbers the rows (`docs/SCORING.md`, "Leaderboard") and caches the result for 60 s. The profile's `globalPosition` comes from the same cache.

## Derived data for the profile

Computed by `computeProfile` in `server/src/services/profileService.js` for `GET /api/profiles/:handle`, from the same newest 1000 attempts and the challenge list. It reuses `computeProgress`.

- `solved`, `attempted` and `totalXp` are the same numbers as in `GET /api/progress`. `challengesAvailable` is the number of rows in `challenges`.
- **Rank**: from `totalXp` with the tiers in `docs/SCORING.md`, "XP and ranks". `{ name, xp, nextName, xpToNext }`; at the top tier `nextName` is null and `xpToNext` is 0.
- **Solved at**: the `created_at` of the first evaluated attempt (oldest `created_at`, then smallest id) on a challenge with a score of at least 70.
- **solvedByLanguage**: solved challenges grouped by the challenge's `language`, most solved first, ties by language name. Languages with no solved challenge are not listed.
- **recentSolves**: at most 10 solved challenges, newest solved-at first (ties by challenge id), each `{ challengeId, title, language, difficulty, bestScore, solvedAt }`.
- A solved challenge that no longer exists in `challenges` counts in `solved` and `totalXp` but is left out of `solvedByLanguage` and `recentSolves`.
- **globalPosition**: the account's position in the cached leaderboard, or null when it has 0 XP or the leaderboard cannot be read.
- Never part of the profile: explanations, feedback, weak categories, email, `auth_user_id`.
