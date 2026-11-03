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

const EnvSchema = z.object({
  SUPABASE_URL: z.url(),
  SUPABASE_SERVICE_KEY: z.string().min(1),
  ALLOWED_ORIGIN: z.url().default('http://localhost:5173'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LLM_API_KEY: z.string().default(''),
  AI_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  DEMO_MODE: z.enum(['true', 'false']).default('false'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
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
  else if (e.LLM_API_KEY === '') aiStatus = 'unavailable';

  return {
    supabaseUrl: e.SUPABASE_URL,
    supabaseServiceKey: e.SUPABASE_SERVICE_KEY,
    allowedOrigin: e.ALLOWED_ORIGIN,
    port: e.PORT,
    llmApiKey: e.LLM_API_KEY,
    aiTimeoutMs: e.AI_TIMEOUT_MS,
    demoMode,
    aiStatus,
    logLevel: e.LOG_LEVEL,
  };
}

// Tests get fixed values from vitest.config.js and must never read server/.env.
if (process.env.NODE_ENV !== 'test') {
  loadEnv({
    path: fileURLToPath(new URL('../../.env', import.meta.url)),
    quiet: true,
  });
}

export const config = parseConfig(process.env);
