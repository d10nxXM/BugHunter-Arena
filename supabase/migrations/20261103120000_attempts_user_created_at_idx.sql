-- History (GET /api/attempts) and progress read one user's attempts newest first.
create index if not exists attempts_user_id_created_at_idx on attempts (user_id, created_at desc);
