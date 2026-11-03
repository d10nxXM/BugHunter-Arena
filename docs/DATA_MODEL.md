# BugHunter Arena - Data model

Three tables in Supabase (PostgreSQL): `challenges`, `attempts`, and the optional `users`. One challenge has many attempts; one user has many attempts.

Challenge JSON files in `server/data/challenges/` are the source of truth; `server/scripts/seed.js` upserts them into `challenges`.

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
| bug_category | string | One of the categories in `docs/SPEC.md` |
| bug_description | string | Cause and consequence; ground truth for the AI |
| reference_solution | string | Correct code, same signature |
| difficulty | `lako` \| `srednje` \| `teško` | |
| tests_json | array | `{ id, args, expected, visible, failsOnOriginal }` |
| hints_json | string[3] | Written hints for levels 1-3 |
| keywords_json | string[][] | Three groups of word stems for the fallback evaluation |
| fallback_feedback | string | Feedback text shown when the AI is unavailable |

`args` is the JSON array of arguments the function is called with. Python `None` is JSON `null`. `failsOnOriginal` is filled in by `scripts/validate-challenges.js`.

See `server/data/challenges/find-max.json` for a complete example.

## Derived data for the dashboard

- **Solved challenge**: best attempt has a score of at least 70.
- **Total score**: sum of the best score per challenge, so retries do not inflate it.
- **Average time**: mean `duration` over solved challenges.
- **Weak categories**: categories where the student most often missed the bug line or scored under 70; top three are shown.
