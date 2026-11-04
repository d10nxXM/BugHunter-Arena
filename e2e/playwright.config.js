import { defineConfig, devices } from '@playwright/test';

// Self-contained: `npm test` inside e2e/ starts two API servers and two Vite dev servers.
//
//   project "demo"      client :4174 -> API :3100, DEMO_MODE=true (deterministic AI output)
//   project "fallback"  client :4175 -> API :3101, DEMO_MODE=false and an unreachable LLM, so the
//                       server must complete the flow through its non-AI fallback (hard rule 6)
//
// Ports differ from the dev defaults (3000/5173) so a running dev server is never reused or
// disturbed. Both servers read server/.env for Supabase; the LLM variables are overridden here,
// so the real LLM key in server/.env is never used and no tokens are spent.
const root = new URL('..', import.meta.url);
const serverDir = new URL('./server', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const clientDir = new URL('./client', root).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const reuse = process.env.E2E_REUSE === '1';

const DEMO = { apiPort: 3100, clientPort: 4174 };
const FALLBACK = { apiPort: 3101, clientPort: 4175 };

function apiServer({ apiPort, clientPort }, demoMode) {
  return {
    command: 'node src/index.js',
    cwd: serverDir,
    url: `http://127.0.0.1:${apiPort}/api/health`,
    reuseExistingServer: reuse,
    timeout: 60_000,
    env: {
      PORT: String(apiPort),
      ALLOWED_ORIGIN: `http://localhost:${clientPort}`,
      DEMO_MODE: demoMode ? 'true' : 'false',
      LOG_LEVEL: 'warn',
      // Unreachable LLM (localhost port 9 refuses connections). The key is a placeholder.
      LLM_API_URL: 'http://localhost:9/v1/chat/completions',
      LLM_API_KEY: 'e2e-placeholder-not-a-secret',
      LLM_MODEL: 'e2e-unreachable',
      AI_TIMEOUT_MS: '3000',
    },
  };
}

function clientServer({ apiPort, clientPort }) {
  return {
    command: `npm run pyodide:copy && npx vite --config ../e2e/vite.e2e.config.js --port ${clientPort} --strictPort --host localhost`,
    cwd: clientDir,
    url: `http://localhost:${clientPort}/`,
    reuseExistingServer: reuse,
    timeout: 120_000,
    env: { E2E_CLIENT_PORT: String(clientPort), E2E_API_PORT: String(apiPort) },
  };
}

export default defineConfig({
  testDir: '.',
  testMatch: '**/*.spec.js',
  timeout: 90_000, // Pyodide's first load is slow
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  outputDir: './test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    locale: 'sr-Latn-ME',
    actionTimeout: 15_000,
  },
  projects: [
    {
      name: 'demo',
      testIgnore: '**/fallback.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${DEMO.clientPort}` },
    },
    {
      name: 'fallback',
      testMatch: '**/fallback.spec.js',
      use: { ...devices['Desktop Chrome'], baseURL: `http://localhost:${FALLBACK.clientPort}` },
    },
  ],
  webServer: [
    apiServer(DEMO, true),
    apiServer(FALLBACK, false),
    clientServer(DEMO),
    clientServer(FALLBACK),
  ],
});
