/**
 * Chainable fake of the supabase-js query builder.
 *
 * It ignores column projection on purpose: a select always returns the FULL
 * stored row, hidden columns included. If the code under test leaks a hidden
 * field, it can only be because its own mapping let it through.
 *
 * Supported chain:
 *   from(t).select(cols).eq(col, v).order(col, opts).limit(n)
 *     .maybeSingle() | .single() | await (list)
 *   from(t).upsert(rows, opts) | await
 *   from(t).insert(row).select(cols).single() | await
 *   from(t).update(patch).eq(col, v)...select(cols).maybeSingle() | await
 *     (every .eq is a condition, so update().eq('status', 'submitted') is a
 *     conditional update; it changes only matching rows and returns them)
 * Inserts and updates mutate the `tables` object passed in. Inserted rows get
 * an id (uuid), created_at and the attempts defaults when missing.
 * `calls` records everything the code under test asked for.
 */
import { randomUUID } from 'node:crypto';

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
    orders: [],
    upserts: [],
    inserts: [],
    updates: [],
  };

  function builder(table) {
    const state = { op: 'select', filters: [], orders: [], payload: null };

    const matches = (row) =>
      state.filters.every(([column, value]) => row[column] === value);

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
      order(column, options = {}) {
        const ascending = options.ascending !== false;
        calls.orders.push({ table, column, ascending });
        state.orders.push({ column, ascending });
        return chain;
      },
      limit(n) {
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

  const db = {
    from(table) {
      calls.from.push(table);
      return builder(table);
    },
  };

  return { db, calls, tables };
}
