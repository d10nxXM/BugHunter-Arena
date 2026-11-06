import { createClient } from '@supabase/supabase-js';
import { db } from './client.js';
import { config } from '../lib/config.js';

/**
 * Supabase Auth (GoTrue) access. The only module that talks to Supabase Auth.
 *
 * PITFALL: never call signInWithPassword or refreshSession on the shared `db`
 * client. supabase-js would keep the user's session and send the user's JWT
 * instead of the service key, so every later DB call would hit RLS (no
 * policies) and fail. Those two calls use a throwaway anon client per call.
 * Admin calls and getUser(jwt) (which keeps no session) use `db`.
 *
 * Every call has a timeout. Errors become an AuthDbError with a fixed `kind`
 * and the HTTP status only: the Supabase error body never leaves this module
 * and is never attached as a cause, so it cannot reach a log.
 */

export const AUTH_TIMEOUT_MS = 5000;

export class AuthDbError extends Error {
  /**
   * @param {'timeout'|'unavailable'|'invalid_credentials'|'invalid_token'|
   *   'email_taken'|'rejected'|'rate_limited'|'not_configured'} kind
   */
  constructor(kind, status) {
    super(`supabase auth: ${kind}`);
    this.name = 'AuthDbError';
    this.kind = kind;
    this.status = Number.isInteger(status) ? status : undefined;
  }
}

/** A fresh anon client that keeps no session. One per call, never shared. */
export function createAnonClient() {
  if (!config.supabaseAnonKey) throw new AuthDbError('not_configured');
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}

async function withTimeout(promiseFactory, timeoutMs) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new AuthDbError('timeout')), timeoutMs);
    timer.unref?.();
  });
  try {
    return await Promise.race([
      Promise.resolve().then(promiseFactory),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
  }
}

const EMAIL_TAKEN_CODES = new Set(['email_exists', 'user_already_exists']);

/** Maps a supabase-js auth error to an AuthDbError. `onClientError` is the
 * kind used for a 4xx that has no more specific meaning. */
function mapError(error, onClientError) {
  if (error instanceof AuthDbError) return error;
  const status = Number.isInteger(error?.status) ? error.status : undefined;
  const code = typeof error?.code === 'string' ? error.code : '';
  if (EMAIL_TAKEN_CODES.has(code))
    return new AuthDbError('email_taken', status);
  if (code === 'weak_password') return new AuthDbError('rejected', status);
  if (status === 429) return new AuthDbError('rate_limited', status);
  if (status !== undefined && status >= 400 && status < 500) {
    return new AuthDbError(onClientError, status);
  }
  // Network errors (status 0 or none) and 5xx.
  return new AuthDbError('unavailable', status);
}

async function call(factory, onClientError, timeoutMs) {
  let result;
  try {
    result = await withTimeout(factory, timeoutMs);
  } catch (err) {
    throw mapError(err, onClientError);
  }
  if (result?.error) throw mapError(result.error, onClientError);
  return result?.data;
}

function toSession(session) {
  if (!session?.access_token || !session?.refresh_token) {
    throw new AuthDbError('unavailable');
  }
  const expiresAt = Number.isInteger(session.expires_at)
    ? session.expires_at
    : Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600);
  return {
    accessToken: session.access_token,
    refreshToken: session.refresh_token,
    expiresAt,
  };
}

/** Creates a confirmed auth user (no email is sent). Returns its id. */
export async function createAuthUser(
  { email, password },
  { timeoutMs = AUTH_TIMEOUT_MS } = {},
) {
  const data = await call(
    () => db.auth.admin.createUser({ email, password, email_confirm: true }),
    'rejected',
    timeoutMs,
  );
  if (!data?.user?.id) throw new AuthDbError('unavailable');
  return data.user.id;
}

/** Deletes an auth user (signup rollback). */
export async function deleteAuthUser(
  authUserId,
  { timeoutMs = AUTH_TIMEOUT_MS } = {},
) {
  await call(() => db.auth.admin.deleteUser(authUserId), 'rejected', timeoutMs);
}

/** Password login on a throwaway client. Returns { authUserId, session }. */
export async function signInWithPassword(
  { email, password },
  { timeoutMs = AUTH_TIMEOUT_MS } = {},
) {
  const data = await call(
    () => createAnonClient().auth.signInWithPassword({ email, password }),
    'invalid_credentials',
    timeoutMs,
  );
  if (!data?.user?.id) throw new AuthDbError('unavailable');
  return { authUserId: data.user.id, session: toSession(data.session) };
}

/** Exchanges a refresh token on a throwaway client. Returns { authUserId, session }. */
export async function refreshSession(
  refreshToken,
  { timeoutMs = AUTH_TIMEOUT_MS } = {},
) {
  const data = await call(
    () =>
      createAnonClient().auth.refreshSession({ refresh_token: refreshToken }),
    'invalid_token',
    timeoutMs,
  );
  if (!data?.user?.id) throw new AuthDbError('invalid_token');
  return { authUserId: data.user.id, session: toSession(data.session) };
}

/** Revokes the refresh tokens of the session behind this access token. */
export async function signOut(jwt, { timeoutMs = AUTH_TIMEOUT_MS } = {}) {
  await call(
    () => db.auth.admin.signOut(jwt, 'local'),
    'invalid_token',
    timeoutMs,
  );
}

/** Verifies an access token with Supabase. Returns the auth user id. */
export async function getAuthUser(jwt, { timeoutMs = AUTH_TIMEOUT_MS } = {}) {
  const data = await call(
    () => db.auth.getUser(jwt),
    'invalid_token',
    timeoutMs,
  );
  if (!data?.user?.id) throw new AuthDbError('invalid_token');
  return data.user.id;
}
