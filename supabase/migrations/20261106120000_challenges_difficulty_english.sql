-- Difficulty values move from Montenegrin (lako, srednje, teško) to English
-- (easy, medium, hard). The original check was declared inline in
-- 20261103002608_init_schema.sql, so Postgres named it challenges_difficulty_check.
-- The DO block also drops any other check on challenges that still lists the
-- old values, so a different name cannot leave the old rule in place.
alter table challenges drop constraint if exists challenges_difficulty_check;

do $$
declare
  old_check record;
begin
  for old_check in
    select conname
    from pg_constraint
    where conrelid = 'public.challenges'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) like '%lako%'
  loop
    execute format('alter table public.challenges drop constraint %I', old_check.conname);
  end loop;
end
$$;

update challenges
set difficulty = case difficulty
  when 'lako' then 'easy'
  when 'srednje' then 'medium'
  when 'teško' then 'hard'
  else difficulty
end
where difficulty in ('lako', 'srednje', 'teško');

alter table challenges
  add constraint challenges_difficulty_check
  check (difficulty in ('easy', 'medium', 'hard'));
