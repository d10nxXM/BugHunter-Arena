import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    passWithNoTests: true,
    // Fixed values so tests never depend on server/.env.
    env: {
      SUPABASE_URL: 'http://localhost:54321',
      SUPABASE_SERVICE_KEY: 'test-service-key',
      SUPABASE_ANON_KEY: 'test-anon-key',
      ALLOWED_ORIGIN: 'http://localhost:5173',
      LLM_API_KEY: '',
      DEMO_MODE: 'false',
      LOG_LEVEL: 'silent',
      PORT: '3000',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['src/**', 'scripts/**'],
    },
  },
});
