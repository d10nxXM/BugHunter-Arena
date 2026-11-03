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