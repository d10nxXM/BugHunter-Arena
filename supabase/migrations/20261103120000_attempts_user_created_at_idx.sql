-- History (GET /api/attempts) and progress read one user's attempts newest first.
-- The trailing id gives the composite (created_at, id) cursor a total order.
create index if not exists attempts_user_id_created_at_idx on attempts (user_id, created_at desc, id desc);
