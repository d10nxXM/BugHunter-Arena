-- Phase 2 accounts: a users row may belong to a Supabase Auth user.
-- Additive only (nullable columns), so it is safe to push before the code deploys.
-- Email lives only in auth.users; it is never copied into public tables.

alter table users
  add column auth_user_id uuid unique references auth.users (id),
  add column handle text unique constraint users_handle_format check (handle ~ '^[a-z0-9_]{3,20}$'),
  add column bio text constraint users_bio_length check (char_length(bio) <= 280);

-- A row is either a guest (both null) or an account (both set).
alter table users
  add constraint users_account_pair check ((auth_user_id is null) = (handle is null));

-- RLS is already enabled on users. No policies: only the service key reads or writes it.
