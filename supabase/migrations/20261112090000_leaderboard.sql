-- Leaderboard: total XP per account (docs/SCORING.md, "Leaderboard").
-- Additive only (one function), so it is safe to push before the code deploys.
--
-- A first solve is, per user and challenge, the evaluated attempt with a score
-- of at least 70 that has the oldest created_at, then the smallest id. Same rule
-- as computeXp in server/src/services/scoringService.js.
-- Guests (handle null) are left out. No email, auth id or users.id is returned.

create or replace function public.leaderboard_xp()
returns table (handle text, total_xp bigint, solved bigint, reached_at timestamptz)
language sql
stable
security invoker
set search_path = public, pg_temp
as $$
  with first_solves as (
    select distinct on (a.user_id, a.challenge_id)
      a.user_id, a.score, a.created_at
    from attempts a
    where a.status = 'evaluated'
      and a.score >= 70
      and a.user_id is not null
    order by a.user_id, a.challenge_id, a.created_at, a.id
  )
  select u.handle,
         sum(f.score)::bigint as total_xp,
         count(*)::bigint as solved,
         max(f.created_at) as reached_at
  from first_solves f
  join users u on u.id = f.user_id
  where u.handle is not null
  group by u.id, u.handle
  -- Best first, so PostgREST's max-rows cap (1000 on Supabase) drops the
  -- bottom of the board, never a random subset. Same order as the server.
  order by total_xp desc, reached_at asc, u.handle collate "C" asc;
$$;

-- Only the server's service key may call it. PostgREST exposes public
-- functions as /rpc/*, so the default execute grant must go.
revoke execute on function public.leaderboard_xp() from public, anon, authenticated;
grant execute on function public.leaderboard_xp() to service_role;
