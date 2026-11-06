import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

const LOG_LEVELS = [
  'fatal',
  'error',
  'warn',
  'info',
  'debug',
  'trace',
  'silent',
];

/**
 * LLM_API_URL must be https. Plain http is accepted only for localhost
 * (a local OpenAI-compatible server during development). Credentials in the
 * URL (user or password) are rejected, because the URL may end up in logs.
 */
function isAllowedLlmUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.username !== '' || url.password !== '') return false;
  if (url.protocol === 'https:') return true;
  return url.protocol === 'http:' && url.hostname === 'localhost';
}

const EnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  // Anon (publishable) key, server only: login and refresh run on a throwaway
  // anon client. Optional so a missing key never takes guest play down;
  // without it, login and refresh return 503 AUTH_UNAVAILABLE.
  SUPABASE_ANON_KEY: z.string().default(''),
  ALLOWED_ORIGIN: z.url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LLM_API_KEY: z.string().default(''),
  LLM_API_URL: z.string().refine(isAllowedLlmUrl).default(''),
  LLM_MODEL: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  // Hop count for Express `trust proxy`. Unset = off. Only a non-negative
  // integer up to 10 is accepted: `true` would trust any X-Forwarded-For value,
  // and a typo such as `11` would let clients choose their own IP.
  TRUST_PROXY: z
    .string()
    .regex(/^\d+$/)
    .transform(Number)
    .refine((n) => Number.isSafeInteger(n) && n <= 10)
    .optional(),
});

/** Empty values (e.g. `PORT=` in .env) count as unset, so defaults apply. */
function withoutEmpty(env) {
  const result = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    if (env[key] !== undefined && env[key] !== '') result[key] = env[key];
  }
  return result;
}

/**
 * Validates environment variables and maps them to typed config.
 * Pure: reads only `env`. The error names the bad variables, never their values.
 */
export function parseConfig(env) {
  const result = EnvSchema.safeParse(withoutEmpty(env));
  if (!result.success) {
    const names = [
      ...new Set(result.error.issues.map((issue) => String(issue.path[0]))),
    ];
    throw new Error(
      `Invalid or missing environment variables: ${names.join(', ')}. See server/.env.example.`,
    );
  }

  const e = result.data;
  const demoMode = e.DEMO_MODE === 'true';
  let aiStatus = 'available';
  if (demoMode) aiStatus = 'demo';
  else if (e.LLM_API_KEY === '' || e.LLM_API_URL === '' || e.LLM_MODEL === '')
    aiStatus = 'unavailable';

  return {
    supabaseUrl: e.SUPABASE_URL,
    supabaseServiceKey: e.SUPABASE_SERVICE_KEY,
    supabaseAnonKey: e.SUPABASE_ANON_KEY,
    allowedOrigin: e.ALLOWED_ORIGIN,
    port: e.PORT,
    llmApiKey: e.LLM_API_KEY,
    // Normalized form: trims spaces, lowercases scheme and host.
    llmApiUrl: e.LLM_API_URL === '' ? '' : new URL(e.LLM_API_URL).href,
    llmModel: e.LLM_MODEL,
    aiTimeoutMs: e.AI_TIMEOUT_MS,
    demoMode,
    aiStatus,
    logLevel: e.LOG_LEVEL,
    trustProxy: e.TRUST_PROXY,
  };
}

/**
 * Names of the LLM variables still missing when the AI is partly configured:
 * aiStatus is 'unavailable' but at least one of LLM_API_KEY, LLM_API_URL,
 * LLM_MODEL is set. Otherwise []. Pure; returns names only, never values.
 */
export function missingLlmVariables(cfg) {
  if (cfg?.aiStatus !== 'unavailable') return [];
  const vars = [
    ['LLM_API_KEY', cfg.llmApiKey],
    ['LLM_API_URL', cfg.llmApiUrl],
    ['LLM_MODEL', cfg.llmModel],
  ];
  const missing = vars.filter(([, value]) => !value).map(([name]) => name);
  return missing.length === vars.length ? [] : missing;
}

// Tests get fixed values from vitest.config.js and must never read server/.env.
if (process.env.NODE_ENV !== 'test') {
  loadEnv({
    path: fileURLToPath(new URL('../../.env', import.meta.url)),
    quiet: true,
  });
}

export const config = parseConfig(process.env);
