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
