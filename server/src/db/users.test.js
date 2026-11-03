import { describe, it, expect, vi } from 'vitest';
import { createFakeSupabase } from '../../test/fakeSupabase.js';

const state = vi.hoisted(() => ({ db: null }));
vi.mock('./client.js', () => ({
  db: { from: (...args) => state.db.from(...args) },
}));

const { createUser, userExists } = await import('./users.js');

const U = '11111111-1111-4111-8111-111111111111';

function install(options) {
  const fake = createFakeSupabase(options);
  state.db = fake.db;
  return fake;
}

describe('createUser', () => {
  it('inserts the display name and returns { id, displayName }', async () => {
    const { tables } = install({ tables: { users: [] } });
    const user = await createUser('dion');
    expect(user).toEqual({ id: tables.users[0].id, displayName: 'dion' });
    expect(tables.users[0].display_name).toBe('dion');
  });

  it('inserts only display_name and selects id, display_name', async () => {
    const { calls } = install({ tables: { users: [] } });
    await createUser('dion');
    expect(calls.inserts).toEqual([
      { table: 'users', row: { display_name: 'dion' } },
    ]);
    expect(calls.selects).toEqual([
      { table: 'users', columns: 'id, display_name' },
    ]);
  });

  it('throws with the database error as cause', async () => {
    const dbError = { code: 'XX000', message: 'boom' };
    install({ insertError: dbError });
    await expect(createUser('dion')).rejects.toMatchObject({
      message: 'createUser failed',
      cause: dbError,
    });
  });
});

describe('userExists', () => {
  it('true for a stored user', async () => {
    install({ tables: { users: [{ id: U, display_name: 'dion' }] } });
    await expect(userExists(U)).resolves.toBe(true);
  });

  it('selects id and filters on id', async () => {
    const { calls } = install({ tables: { users: [] } });
    await userExists(U);
    expect(calls.selects).toEqual([{ table: 'users', columns: 'id' }]);
    expect(calls.filters).toEqual([{ table: 'users', column: 'id', value: U }]);
  });

  it('false for an unknown user', async () => {
    install({ tables: { users: [] } });
    await expect(userExists(U)).resolves.toBe(false);
  });

  it('throws on a database error', async () => {
    install({ error: { message: 'boom' } });
    await expect(userExists(U)).rejects.toThrow('userExists failed');
  });
});
