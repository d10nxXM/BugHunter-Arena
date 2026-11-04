import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

// Same-origin proxy to the Express API, so VITE_API_URL can stay empty in development.
const apiProxy = {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
  worker: { format: 'es' },
  // Pyodide is served from public/pyodide/ and must not be pre-bundled.
  optimizeDeps: { exclude: ['pyodide'] },
  test: {
    environment: 'jsdom',
    setupFiles: './src/test/setup.js',
    include: ['src/**/*.test.{js,jsx}'],
    globals: false,
  },
});
