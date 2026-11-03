# BugHunter Arena - Data model

Three tables in Supabase (PostgreSQL): `challenges`, `attempts`, and the optional `users`. One challenge has many attempts; one user has many attempts.

Challenge JSON files in `server/data/challenges/` are the source of truth. `server/scripts/seed.js` (`npm run seed` in `server/`) checks every file against `ChallengeFileSchema` and checks that the file name matches the id, then upserts all of them into `challenges` in one call. If any file is invalid, nothing is written. The seed does not run the extra checks of `validate-challenges` (see Validation rules).

The schema is applied through migrations in `supabase/migrations/`, pushed with `npx supabase db push` after the PR is merged to `main`. The SQL below is the schema after all migrations (see the Migrations table); later changes are new migration files, and this document is updated in the same PR.

## SQL schema

```sql
create extension if not exists pgcrypto;

create table users (
  id uuid primary key default gen_random_uuid(),
  display_name text not null check (char_length(display_name) between 2 and 32),
  created_at timestamptz not null default now()
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
  difficulty text not null check (difficulty in ('lako', 'srednje', 'teško')),
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
-- 20261103120000_attempts_user_created_at_idx.sql
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
| `20261103120000_attempts_user_created_at_idx.sql` | Index `attempts_user_id_created_at_idx` on `attempts (user_id, created_at desc, id desc)` for history (keyset order) and progress reads |

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
| title, description | string | Shown to the student (Montenegrin) |
| language | `python` \| `javascript` | |
| function_name | string | Function the tests call |
| code | string | Buggy code |
| bug_lines | int[] | 1-based lines that contain the bug |
| related_lines | int[] | Lines that earn partial credit |
| bug_category | string | Exact Montenegrin category name from the Bug categories table in `docs/SPEC.md`, e.g. `Pogrešna inicijalizacija` |
| bug_description | string | Cause and consequence; ground truth for the AI |
| reference_solution | string | Correct code, same signature |
| difficulty | `lako` \| `srednje` \| `teško` | |
| tests_json | array | `{ id, args, expected, visible, failsOnOriginal }`. `failsOnOriginal` is `true` when the test fails on the buggy `code` and passes on `reference_solution` |
| hints_json | string[3] | Written hints for levels 1-3 |
| keywords_json | string[][] | Three groups of word stems for the fallback evaluation |
| fallback_feedback | string | Feedback text shown when the AI is unavailable |

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
- `language`: `python` or `javascript`. `difficulty`: `lako`, `srednje` or `teško`.
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
- A user with no attempts gets zeros and empty lists.
