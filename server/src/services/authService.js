import { AppError } from '../lib/AppError.js';
import { logger } from '../lib/logger.js';
import {
  AuthDbError,
  createAuthUser,
  deleteAuthUser,
  getAuthUser,
  refreshSession,
  signInWithPassword,
  signOut,
} from '../db/auth.js';
import {
  UNIQUE_VIOLATION,
  claimGuestRow,
  createAccountRow,
  findAccountByAuthId,
  findAccountByHandle,
} from '../db/users.js';

// Never log: email, password, tokens, Supabase error bodies. Log lines carry
// a fixed op name, the error kind and the HTTP status only.

const INVALID_CREDENTIALS = 'Invalid email or password.';
const UNAUTHORIZED = 'Your session is not valid. Log in again.';

export const handleTaken = () =>
  new AppError(409, 'HANDLE_TAKEN', 'This handle is already taken.');

export const unauthorized = () =>
  new AppError(401, 'UNAUTHORIZED', UNAUTHORIZED);

function authUnavailable() {
  return new AppError(
    503,
    'AUTH_UNAVAILABLE',
    'Accounts are unavailable right now. Try again in a moment, or play as a guest.',
  );
}

/** Maps an AuthDbError to the API error; anything else is rethrown as is. */
function toAppError(err, op) {
  if (!(err instanceof AuthDbError)) return err;
  switch (err.kind) {
    case 'invalid_credentials':
      return new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
    case 'invalid_token':
      return unauthorized();
    case 'email_taken':
      return new AppError(
        409,
        'EMAIL_TAKEN',
        'An account with this email already exists. Log in instead.',
      );
    case 'rejected':
      return new AppError(
        400,
        'VALIDATION_ERROR',
        'This password is not accepted. Choose a different one.',
      );
    case 'rate_limited':
      return new AppError(
        429,
        'RATE_LIMITED',
        'Too many requests. Wait a moment and try again.',
      );
    default:
      logger.warn(
        { route: 'auth', op, kind: err.kind, status: err.status },
        'supabase auth unavailable',
      );
      return authUnavailable();
  }
}

async function guard(op, fn) {
  try {
    return await fn();
  } catch (err) {
    throw toAppError(err, op);
  }
}

/** The account as the API returns it: no auth id, no email. */
export function publicUser(account) {
  return {
    id: account.id,
    handle: account.handle,
    displayName: account.displayName,
    memberSince: account.memberSince,
  };
}

/**
 * POST /api/auth/signup. Handle check, then the auth user, then the users
 * row (claim or insert). If the row write fails the auth user is deleted
 * again. Returns { session, user }.
 */
export async function signup({ handle, email, password, claimUserId = null }) {
  if (await findAccountByHandle(handle)) throw handleTaken();

  const authUserId = await guard('createAuthUser', () =>
    createAuthUser({ email, password }),
  );

  let account;
  try {
    if (claimUserId) {
      account = await claimGuestRow(claimUserId, { authUserId, handle });
    }
    account ??= await createAccountRow({ authUserId, handle });
  } catch (err) {
    try {
      await deleteAuthUser(authUserId);
    } catch (rollbackErr) {
      logger.error(
        {
          route: 'auth',
          op: 'deleteAuthUser',
          kind: rollbackErr?.kind,
          status: rollbackErr?.status,
        },
        'signup rollback failed: auth user without account row',
      );
    }
    if (err?.cause?.code === UNIQUE_VIOLATION) throw handleTaken();
    throw err;
  }

  const { session } = await guard('signInAfterSignup', () =>
    signInWithPassword({ email, password }),
  );
  return { session, user: publicUser(account) };
}

/** POST /api/auth/login. Returns { session, user }. */
export async function login({ email, password }) {
  const { authUserId, session } = await guard('signIn', () =>
    signInWithPassword({ email, password }),
  );
  const account = await findAccountByAuthId(authUserId);
  if (!account) {
    // An auth user with no row (e.g. a failed signup rollback). Same
    // response as a wrong password.
    logger.warn({ route: 'auth', op: 'login' }, 'auth user has no account row');
    throw new AppError(401, 'INVALID_CREDENTIALS', INVALID_CREDENTIALS);
  }
  return { session, user: publicUser(account) };
}

/** POST /api/auth/refresh. Returns { session }. */
export async function refresh(refreshToken) {
  const { session } = await guard('refresh', () =>
    refreshSession(refreshToken),
  );
  return { session };
}

/** POST /api/auth/logout: revokes this session's refresh tokens. */
export async function logout(accessToken) {
  await guard('signOut', () => signOut(accessToken));
}

/**
 * Verifies an access token. Returns the account (with id, handle,
 * displayName, memberSince) or throws 401 UNAUTHORIZED / 503 AUTH_UNAVAILABLE.
 */
export async function verifyAccessToken(accessToken) {
  const authUserId = await guard('getUser', () => getAuthUser(accessToken));
  const account = await findAccountByAuthId(authUserId);
  if (!account) throw unauthorized();
  return account;
}
