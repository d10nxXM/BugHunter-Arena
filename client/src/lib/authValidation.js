// Client checks for the login and signup forms, mirroring the server rules (docs/API.md, auth),
// and English messages for the server's auth errors. The server stays the authority.
import { ApiError } from '../api/client.js';

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const RESERVED_HANDLES = Object.freeze(
  'me admin api auth login signup profile u null undefined'.split(' '),
);
export const PASSWORD_MIN = 10;
export const PASSWORD_MAX = 72;
export const EMAIL_MAX = 254;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const MESSAGES = Object.freeze({
  handleFormat: 'Use 3 to 20 letters, numbers or underscores.',
  handleReserved: 'This handle is reserved. Pick another one.',
  handleTaken: 'This handle is already taken. Pick another one.',
  emailRequired: 'Enter your email address.',
  emailFormat: 'Enter a valid email address, like you@example.com.',
  emailTaken: 'An account with this email already exists.',
  passwordRequired: 'Enter your password.',
  passwordShort: `Use at least ${PASSWORD_MIN} characters.`,
  passwordLong: `Use at most ${PASSWORD_MAX} characters.`,
  invalidCredentials: 'Invalid email or password.',
  rateLimited: 'Too many attempts. Wait a few minutes and try again.',
  unavailable:
    'Accounts are not available right now. Try again in a minute, or keep playing as a guest.',
  timeout: 'The server is waking up. Wait a moment and try again.',
  generic: 'Something went wrong. Please try again.',
});

/** Lowercased, trimmed handle as the server stores it. */
export function normalizeHandle(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}

export function normalizeEmail(value) {
  return String(value ?? '').trim();
}

function emailError(email) {
  if (!email) return MESSAGES.emailRequired;
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return MESSAGES.emailFormat;
  return null;
}

/** Field errors for the signup form: { handle?, email?, password? }. Empty object when valid. */
export function validateSignup({ handle, email, password }) {
  const errors = {};
  const h = normalizeHandle(handle);
  if (!HANDLE_PATTERN.test(h)) errors.handle = MESSAGES.handleFormat;
  else if (RESERVED_HANDLES.includes(h)) errors.handle = MESSAGES.handleReserved;
  const e = emailError(normalizeEmail(email));
  if (e) errors.email = e;
  const p = String(password ?? '');
  if (p.length < PASSWORD_MIN) errors.password = MESSAGES.passwordShort;
  else if (p.length > PASSWORD_MAX) errors.password = MESSAGES.passwordLong;
  return errors;
}

/** Field errors for the login form: { email?, password? }. */
export function validateLogin({ email, password }) {
  const errors = {};
  const e = emailError(normalizeEmail(email));
  if (e) errors.email = e;
  if (!password) errors.password = MESSAGES.passwordRequired;
  return errors;
}

/**
 * Maps an auth API error to { field?, message }: a field error for 409 HANDLE_TAKEN or
 * EMAIL_TAKEN, otherwise a form-level message.
 */
export function authErrorDisplay(error) {
  if (!(error instanceof ApiError)) return { message: MESSAGES.generic };
  switch (error.code) {
    case 'HANDLE_TAKEN':
      return { field: 'handle', message: MESSAGES.handleTaken };
    case 'EMAIL_TAKEN':
      return { field: 'email', message: MESSAGES.emailTaken };
    case 'INVALID_CREDENTIALS':
      return { message: MESSAGES.invalidCredentials };
    case 'RATE_LIMITED':
      return { message: MESSAGES.rateLimited };
    case 'TIMEOUT':
      return { message: MESSAGES.timeout };
    case 'AUTH_UNAVAILABLE':
    case 'NETWORK_ERROR':
      return { message: MESSAGES.unavailable };
    case 'VALIDATION_ERROR':
      return { message: error.message || MESSAGES.generic };
    default:
      if (error.status === 429) return { message: MESSAGES.rateLimited };
      if (error.status === 401) return { message: MESSAGES.invalidCredentials };
      if (error.status === 503) return { message: MESSAGES.unavailable };
      return { message: MESSAGES.generic };
  }
}
