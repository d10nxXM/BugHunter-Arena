import { z } from 'zod';

// Request schemas for accounts and profiles (docs/API.md). Unknown keys are
// stripped. Messages are shown to the user and never echo the input.

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const RESERVED_HANDLES = Object.freeze(
  new Set([
    'me',
    'admin',
    'api',
    'auth',
    'login',
    'signup',
    'profile',
    'u',
    'null',
    'undefined',
  ]),
);

const HANDLE_MESSAGE =
  'Handle must be 3 to 20 characters: lowercase letters, digits or underscores.';
const PASSWORD_MESSAGE = 'Password must be 10 to 72 characters.';
const EMAIL_MESSAGE = 'Enter a valid email address.';

/** Lowercased handle in the allowed format (reserved names still pass). */
const HandleFormatSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(HANDLE_PATTERN, { message: HANDLE_MESSAGE });

/** Handle for signup: format plus the reserved list. */
export const HandleSchema = HandleFormatSchema.refine(
  (handle) => !RESERVED_HANDLES.has(handle),
  { message: 'This handle is reserved. Choose another one.' },
);

const EmailSchema = z
  .string({ message: EMAIL_MESSAGE })
  .trim()
  .toLowerCase()
  .max(254, { message: EMAIL_MESSAGE })
  .pipe(z.email({ message: EMAIL_MESSAGE }));

// 72 is GoTrue's bcrypt cap, in bytes. Not trimmed.
const PasswordSchema = z
  .string({ message: PASSWORD_MESSAGE })
  .min(10, { message: PASSWORD_MESSAGE })
  .max(72, { message: PASSWORD_MESSAGE })
  .refine((p) => Buffer.byteLength(p, 'utf8') <= 72, {
    message: PASSWORD_MESSAGE,
  });

/** POST /api/auth/signup. */
export const SignupSchema = z.object({
  handle: HandleSchema,
  email: EmailSchema,
  password: PasswordSchema,
  claimUserId: z.guid().nullable().default(null),
});

/** POST /api/auth/login. No length rule beyond sane bounds: any wrong value is a generic 401. */
export const LoginSchema = z.object({
  email: EmailSchema,
  password: z
    .string({ message: 'Enter your password.' })
    .min(1, { message: 'Enter your password.' })
    .max(256),
});

/** POST /api/auth/refresh. */
export const RefreshSchema = z.object({
  refreshToken: z.string().min(1).max(2048),
});

/** Path params of GET /api/profiles/:handle. */
export const ProfileParamsSchema = z.object({ handle: HandleFormatSchema });
