import { db } from './client.js';

/** Inserts a user and returns { id, displayName }. */
export async function createUser(displayName) {
  const { data, error } = await db
    .from('users')
    .insert({ display_name: displayName })
    .select('id, display_name')
    .single();
  if (error) throw new Error('createUser failed', { cause: error });
  return { id: data.id, displayName: data.display_name };
}

/** True if a user with this id exists. */
export async function userExists(id) {
  const { data, error } = await db
    .from('users')
    .select('id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('userExists failed', { cause: error });
  return data !== null;
}

// Postgres unique violation (users.handle, users.auth_user_id).
export const UNIQUE_VIOLATION = '23505';

const ACCOUNT_COLUMNS = 'id, display_name, handle, auth_user_id, created_at';

function toAccount(row) {
  return {
    id: row.id,
    handle: row.handle,
    displayName: row.display_name,
    memberSince: row.created_at,
    authUserId: row.auth_user_id,
  };
}

/**
 * The user row by id as { id, isAccount }, or null if it does not exist.
 * An account row has auth_user_id set; a guest row does not.
 */
export async function findUserById(id) {
  const { data, error } = await db
    .from('users')
    .select('id, auth_user_id')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error('findUserById failed', { cause: error });
  if (!data) return null;
  return { id: data.id, isAccount: data.auth_user_id != null };
}

/**
 * Inserts an account row (display_name = handle). Throws an error with
 * `cause.code === UNIQUE_VIOLATION` if the handle is taken.
 */
export async function createAccountRow({ authUserId, handle }) {
  const { data, error } = await db
    .from('users')
    .insert({ auth_user_id: authUserId, handle, display_name: handle })
    .select(ACCOUNT_COLUMNS)
    .single();
  if (error) throw new Error('createAccountRow failed', { cause: error });
  return toAccount(data);
}

/**
 * Turns a guest row into an account with one conditional update (only while
 * auth_user_id is null). Returns the account, or null if the row is missing
 * or already claimed. Throws with `cause.code === UNIQUE_VIOLATION` if the
 * handle is taken.
 */
export async function claimGuestRow(guestId, { authUserId, handle }) {
  const { data, error } = await db
    .from('users')
    .update({ auth_user_id: authUserId, handle, display_name: handle })
    .eq('id', guestId)
    .is('auth_user_id', null)
    .select(ACCOUNT_COLUMNS)
    .maybeSingle();
  if (error) throw new Error('claimGuestRow failed', { cause: error });
  return data ? toAccount(data) : null;
}

/** The account for a Supabase Auth user id, or null. */
export async function findAccountByAuthId(authUserId) {
  const { data, error } = await db
    .from('users')
    .select(ACCOUNT_COLUMNS)
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (error) throw new Error('findAccountByAuthId failed', { cause: error });
  return data ? toAccount(data) : null;
}

/** The account with this handle (already lowercased), or null. */
export async function findAccountByHandle(handle) {
  const { data, error } = await db
    .from('users')
    .select(ACCOUNT_COLUMNS)
    .eq('handle', handle)
    .maybeSingle();
  if (error) throw new Error('findAccountByHandle failed', { cause: error });
  return data && data.auth_user_id != null ? toAccount(data) : null;
}
