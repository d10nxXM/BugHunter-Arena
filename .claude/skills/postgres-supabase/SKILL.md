---
name: postgres-supabase
description: PostgreSQL and Supabase patterns for BugHunter Arena - schema conventions, indexes for the dashboard, RLS with server-only access, migrations, the seed script, and querying with supabase-js from server/src/db/. Use when changing the schema, writing queries or migrations, or debugging slow or failing database calls.
---

# PostgreSQL and Supabase

The schema of record is `docs/DATA_MODEL.md`. Database access happens only in `server/src/db/`, with the service key.

## Access model

- RLS is enabled on every table with **no policies**. The anon key can do nothing; the service key (server only) bypasses RLS.
- Never use the anon or service key in `client/`. The browser talks only to Express.
- A new table gets `alter table x enable row level security;` in the same migration.

## Client

```js
// server/src/db/client.js
import { createClient } from '@supabase/supabase-js';
import { config } from '../lib/config.js';

export const db = createClient(config.supabaseUrl, config.supabaseServiceKey, {
  auth: { persistSession: false },
});
```

## Queries

```js
// server/src/db/challenges.js
const PUBLIC_COLUMNS = 'id, title, description, language, difficulty, bug_category, function_name, code, tests_json';

export async function getPublicChallenge(id) {
  const { data, error } = await db.from('challenges').select(PUBLIC_COLUMNS).eq('id', id).maybeSingle();
  if (error) throw new Error('getPublicChallenge failed', { cause: error });
  if (!data) return null;
  return {
    id: data.id,
    title: data.title,
    description: data.description,
    language: data.language,
    difficulty: data.difficulty,
    bugCategory: data.bug_category,
    functionName: data.function_name,
    code: data.code,
    visibleTests: data.tests_json.filter((t) => t.visible).map(({ id, args, expected }) => ({ id, args, expected })),
  };
}
```

- Select explicit columns. Public reads never select hidden columns.
- Always check `error`. `maybeSingle()` returns `null` for no row; `single()` errors.
- Map snake_case to camelCase here, not in routes.

## Dashboard query without N+1

Prefer a SQL view or function, called once:

```sql
create view attempt_best as
select user_id, challenge_id, max(score) as best_score, count(*) as attempts
from attempts
where status = 'evaluated'
group by user_id, challenge_id;
```

```js
const { data, error } = await db.from('attempt_best').select('*').eq('user_id', userId);
```

## Indexes

| Query | Index |
| --- | --- |
| Attempts of a user (dashboard, history) | `attempts (user_id, created_at desc)` |
| Attempts of a challenge | `attempts (challenge_id)` |
| Foreign keys | always indexed |

Add an index when a query filters or sorts on a column, not speculatively. Check with `explain analyze` in the Supabase SQL editor.

## Types and constraints

- `text` (not `varchar(n)`), `timestamptz` (not `timestamp`), `jsonb` (not `json`).
- `check` constraints for enums and ranges, mirrored in the Zod schemas.
- `not null` wherever the app always provides a value.

## Migrations

- Keep SQL migrations in `server/db/migrations/NNN_description.sql`, applied in order (Supabase CLI or the SQL editor).
- Never edit an applied migration; add a new one.
- Adding a `not null` column to a table with rows needs a default or a backfill step.

## Seed

`server/scripts/seed.js` reads `server/data/challenges/*.json` and upserts by `id`:

```js
const { error } = await db.from('challenges').upsert(rows, { onConflict: 'id' });
```

Running it twice must give the same result.

## Pagination

History uses keyset pagination on `(created_at, id)`, not large offsets:

```js
db.from('attempts').select('id, challenge_id, score, created_at')
  .eq('user_id', userId).lt('created_at', cursor).order('created_at', { ascending: false }).limit(20);
```
