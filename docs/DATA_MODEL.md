# BugHunter Arena - Data model

Three tables in Supabase (PostgreSQL): `challenges`, `attempts`, and the optional `users`. One challenge has many attempts; one user has many attempts.

Challenge JSON files in `server/data/challenges/` are the source of truth. `server/scripts/seed.js` (`npm run seed` in `server/`) checks every file against `ChallengeFileSchema` and checks that the file name matches the id, then upserts all of them into `challenges` in one call. If any file is invalid, nothing is written. The seed does not run the extra checks of `validate-challenges` (see Validation rules).

The schema is applied through migrations in `supabase/migrations/`, pushed with `npx supabase db push --remote` after the PR is merged to `main`. The SQL below is the first migration; later changes are new migration files, and this document is updated in the same PR.

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

alter table users enable row level security;
alter table challenges enable row level security;
alter table attempts enable row level security;
-- No policies: only the server's service key reads and writes these tables.
```

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

- **Solved challenge**: best attempt has a score of at least 70.
- **Total score**: sum of the best score per challenge, so retries do not inflate it.
- **Average time**: mean `duration` over solved challenges.
- **Weak categories**: categories where the student most often missed the bug line or scored under 70; top three are shown.
