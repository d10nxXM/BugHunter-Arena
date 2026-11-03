/**
 * Chainable fake of the supabase-js query builder.
 *
 * It ignores column projection on purpose: a select always returns the FULL
 * stored row, hidden columns included. If the code under test leaks a hidden
 * field, it can only be because its own mapping let it through.
 *
 * Supported chain: from(t).select(cols).eq(col, v).order(col, opts).limit(n)
 *   .maybeSingle() | await (list) and from(t).upsert(rows, opts) | await.
 * `calls` records everything the code under test asked for.
 */
export function createFakeSupabase({
  tables = {},
  error = null,
  upsertError = null,
} = {}) {
  const calls = { from: [], selects: [], filters: [], orders: [], upserts: [] };

  function builder(table) {
    const state = { op: 'select', filters: [], orders: [] };

    function finish(single) {
      if (state.op === 'upsert') {
        return { data: null, error: upsertError ?? error };
      }
      if (error) return { data: null, error };

      let rows = structuredClone(tables[table] ?? []);
      for (const [column, value] of state.filters) {
        rows = rows.filter((row) => row[column] === value);
      }
      for (const { column, ascending } of [...state.orders].reverse()) {
        rows.sort((a, b) => {
          if (a[column] === b[column]) return 0;
          const result = a[column] < b[column] ? -1 : 1;
          return ascending ? result : -result;
        });
      }
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
      limit() {
        return chain;
      },
      upsert(rows, options) {
        state.op = 'upsert';
        calls.upserts.push({ table, rows, options });
        return chain;
      },
      maybeSingle() {
        return Promise.resolve(finish(true));
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

  return { db, calls };
}
