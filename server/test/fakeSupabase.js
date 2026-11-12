/**
 * Chainable fake of the supabase-js query builder.
 *
 * It ignores column projection on purpose: a select always returns the FULL
 * stored row, hidden columns included. If the code under test leaks a hidden
 * field, it can only be because its own mapping let it through.
 *
 * Supported chain:
 *   from(t).select(cols).eq(col, v).lt(col, v).or(expr).order(col, opts).limit(n)
 *     .maybeSingle() | .single() | await (list)
 *     (.is(col, null) matches null or a missing column, recorded in
     calls.ises;
     .eq is an equality filter recorded in calls.filters; .lt keeps rows
 *     with row[col] < v and is recorded apart, in calls.ranges, so
 *     calls.filters stays equality-only; .limit is recorded in calls.limits)
 *   .or(expr) accepts ONLY the keyset shape
 *     created_at.lt."T",and(created_at.eq."T",id.lt.ID) and throws on any
 *     other; recorded in calls.ors as { table, expr }. created_at compares
 *     as an instant like .lt.
 *   .lt compares like PostgREST on a timestamptz column: when both sides
 *     parse as ISO 8601 dates they are compared as instants (Date.parse), so
 *     '+00:00', '+02:00' and 'Z' offsets mean the same moment. Precision is
 *     milliseconds (Postgres keeps microseconds). Anything else falls back to
 *     a string compare.
 *   from(t).upsert(rows, opts) | await
 *   from(t).insert(row).select(cols).single() | await
 *   from(t).update(patch).eq(col, v)...select(cols).maybeSingle() | await
 *     (every .eq is a condition, so update().eq('status', 'submitted') is a
 *     conditional update; it changes only matching rows and returns them)
 *   rpc('leaderboard_xp') | await
 *     emulates supabase/migrations/20261112090000_leaderboard.sql over
 *     tables.users and tables.attempts; recorded in calls.rpcs. Any other
 *     function name throws.
 * Inserts and updates mutate the `tables` object passed in. Inserted rows get
 * an id (uuid), created_at and the attempts defaults when missing.
 * `calls` records everything the code under test asked for.
 */
import { randomUUID } from 'node:crypto';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T|\s|$)/;

/** a < b, as instants when both are ISO dates, else as strings. */
export function lessThan(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const ta = ISO_DATE.test(a) ? Date.parse(a) : NaN;
    const tb = ISO_DATE.test(b) ? Date.parse(b) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta < tb;
  }
  return a < b;
}

const KEYSET_OR =
  /^created_at\.lt\."([^"]+)",and\(created_at\.eq\."([^"]+)",id\.lt\.([^,()"]+)\)$/;

/** Parses ONLY the composite keyset filter db/attempts.js sends; else throws. */
function parseKeysetOr(expr) {
  const m = KEYSET_OR.exec(expr);
  if (!m || m[1] !== m[2]) {
    throw new Error(`fakeSupabase: unsupported or() expression: ${expr}`);
  }
  return { before: m[1], id: m[3] };
}

/** a === b, as instants when both are ISO dates (same rules as lessThan). */
function sameInstant(a, b) {
  if (typeof a === 'string' && typeof b === 'string') {
    const ta = ISO_DATE.test(a) ? Date.parse(a) : NaN;
    const tb = ISO_DATE.test(b) ? Date.parse(b) : NaN;
    if (!Number.isNaN(ta) && !Number.isNaN(tb)) return ta === tb;
  }
  return a === b;
}

/** created_at < before, or created_at = before and id < id. */
function keysetAfter(row, before, id) {
  return (
    lessThan(row.created_at, before) ||
    (sameInstant(row.created_at, before) &&
      String(row.id).toLowerCase() < String(id).toLowerCase())
  );
}

const DEFAULTS = {
  attempts: { status: 'submitted', hints_used: 0 },
};

export function createFakeSupabase({
  tables = {},
  error = null,
  upsertError = null,
  insertError = null,
  updateError = null,
} = {}) {
  const calls = {
    from: [],
    selects: [],
    filters: [],
    ises: [],
    ranges: [],
    ors: [],
    orders: [],
    limits: [],
    upserts: [],
    inserts: [],
    updates: [],
    rpcs: [],
  };

  function builder(table) {
    const state = {
      op: 'select',
      filters: [],
      ises: [],
      ranges: [],
      ors: [],
      orders: [],
      payload: null,
    };

    const matches = (row) =>
      state.filters.every(([column, value]) => row[column] === value) &&
      state.ises.every(([column, value]) => (row[column] ?? null) === value) &&
      state.ranges.every(([column, value]) => lessThan(row[column], value)) &&
      state.ors.every(({ before, id }) => keysetAfter(row, before, id));

    function finish(single) {
      if (state.op === 'upsert') {
        return { data: null, error: upsertError ?? error };
      }
      if (error) return { data: null, error };

      if (state.op === 'insert') {
        if (insertError) return { data: null, error: insertError };
        tables[table] ??= [];
        const row = {
          id: randomUUID(),
          created_at: new Date().toISOString(),
          ...structuredClone(DEFAULTS[table] ?? {}),
          ...structuredClone(state.payload),
        };
        tables[table].push(row);
        return { data: structuredClone(row), error: null };
      }

      if (state.op === 'update') {
        if (updateError) return { data: null, error: updateError };
        const hit = (tables[table] ?? []).filter(matches);
        for (const row of hit)
          Object.assign(row, structuredClone(state.payload));
        const data = structuredClone(hit);
        return single
          ? { data: data[0] ?? null, error: null }
          : { data, error: null };
      }

      let rows = structuredClone(tables[table] ?? []).filter(matches);
      for (const { column, ascending } of [...state.orders].reverse()) {
        rows.sort((a, b) => {
          if (a[column] === b[column]) return 0;
          const result = a[column] < b[column] ? -1 : 1;
          return ascending ? result : -result;
        });
      }
      rows = rows.slice(0, state.limit ?? rows.length);
      return single
        ? { data: rows[0] ?? null, error: null }
        : { data: rows, error: null };
    }

    const chain = {
      select(columns) {
        calls.selects.push({ table, columns });
        return chain;
      },
      eq(column, value) {
        calls.filters.push({ table, column, value });
        state.filters.push([column, value]);
        return chain;
      },
      is(column, value) {
        // Like PostgREST `is`: null matches null and undefined (missing column).
        calls.ises.push({ table, column, value });
        state.ises.push([column, value]);
        return chain;
      },
      lt(column, value) {
        calls.ranges.push({ table, column, op: 'lt', value });
        state.ranges.push([column, value]);
        return chain;
      },
      or(expr) {
        calls.ors.push({ table, expr });
        state.ors.push(parseKeysetOr(expr));
        return chain;
      },
      order(column, options = {}) {
        const ascending = options.ascending !== false;
        calls.orders.push({ table, column, ascending });
        state.orders.push({ column, ascending });
        return chain;
      },
      limit(n) {
        calls.limits.push({ table, limit: n });
        state.limit = n;
        return chain;
      },
      upsert(rows, options) {
        state.op = 'upsert';
        calls.upserts.push({ table, rows, options });
        return chain;
      },
      insert(row) {
        state.op = 'insert';
        state.payload = row;
        calls.inserts.push({ table, row });
        return chain;
      },
      update(patch) {
        state.op = 'update';
        state.payload = patch;
        calls.updates.push({ table, patch });
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
      },
      single() {
        const result = finish(true);
        if (!result.error && result.data === null) {
          return Promise.resolve({
            data: null,
            error: { code: 'PGRST116', message: 'no rows' },
          });
        }
        return Promise.resolve(result);
      },
      then(resolve, reject) {
        return Promise.resolve(finish(false)).then(resolve, reject);
      },
    };
    return chain;
  }

  /** Same rule as leaderboard_xp(): first solves per user and challenge. */
  function leaderboardXp() {
    const first = new Map();
    for (const a of tables.attempts ?? []) {
      if (a.status !== 'evaluated' || !(a.score >= 70) || !a.user_id) continue;
      const key = `${a.user_id}|${a.challenge_id}`;
      const cur = first.get(key);
      const earlier =
        !cur ||
        lessThan(a.created_at, cur.created_at) ||
        (sameInstant(a.created_at, cur.created_at) &&
          String(a.id) < String(cur.id));
      if (earlier) first.set(key, a);
    }
    const byUser = new Map();
    for (const a of first.values()) {
      const u = byUser.get(a.user_id) ?? {
        total_xp: 0,
        solved: 0,
        reached_at: null,
      };
      u.total_xp += a.score;
      u.solved += 1;
      if (u.reached_at === null || lessThan(u.reached_at, a.created_at)) {
        u.reached_at = a.created_at;
      }
      byUser.set(a.user_id, u);
    }
    const out = [];
    for (const [userId, u] of byUser) {
      const user = (tables.users ?? []).find((x) => x.id === userId);
      if (user?.handle) out.push({ handle: user.handle, ...u });
    }
    return out;
  }

  const db = {
    from(table) {
      calls.from.push(table);
      return builder(table);
    },
    rpc(name) {
      calls.rpcs.push(name);
      if (name !== 'leaderboard_xp') {
        throw new Error(`fakeSupabase: unsupported rpc: ${name}`);
      }
      if (error) return Promise.resolve({ data: null, error });
      return Promise.resolve({ data: leaderboardXp(), error: null });
    },
  };

  return { db, calls, tables };
}
