-- The attempts list uses a composite (created_at, id) cursor, so the index
-- must carry id as the final sort key. This replaces the definition applied by
-- 20261103120000, which stays untouched. The name is kept so docs and the
-- planned drop of attempts_user_id_idx are unaffected.
drop index if exists attempts_user_id_created_at_idx;
create index attempts_user_id_created_at_idx on attempts (user_id, created_at desc, id desc);
