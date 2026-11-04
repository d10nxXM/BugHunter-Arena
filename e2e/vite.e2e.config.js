// Vite config used only by the e2e run. It reuses client/vite.config.js (plugins, worker format,
// optimizeDeps) and changes two things, so the run never touches a dev server a developer has
// open on 5173/3000 and never edits client/:
//   - client port and API port come from E2E_CLIENT_PORT / E2E_API_PORT,
//   - Vite's dep cache lives in e2e/.vite-cache instead of client/node_modules/.vite,
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import base from '../client/vite.config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const clientPort = Number(process.env.E2E_CLIENT_PORT ?? 4174);
const apiPort = Number(process.env.E2E_API_PORT ?? 3100);

export default {
  ...base,
  cacheDir: path.join(here, '.vite-cache'),
  server: {
    ...base.server,
    port: clientPort,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${apiPort}`,
        changeOrigin: true,
      },
    },
  },
};
