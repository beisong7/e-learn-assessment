import { randomUUID } from 'node:crypto';
import { defineConfig } from '@playwright/test';

const runId = process.env.E2E_RUN_ID || randomUUID();
process.env.E2E_RUN_ID = runId;
export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    browserName: 'chromium',
    channel: 'chrome',
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'npm run e2e:server --prefix ../backend',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10000 },
      url: 'http://127.0.0.1:4108/api/health',
      reuseExistingServer: false,
      env: {
        HOST: '127.0.0.1',
        PORT: '4108',
        FRONTEND_ORIGIN: 'http://127.0.0.1:5174',
        E2E_RUN_ID: runId,
      },
    },
    {
      command: 'npm run dev -- --host 127.0.0.1 --port 5174 --strictPort',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      env: { API_PROXY_TARGET: 'http://127.0.0.1:4108', VITE_API_BASE_URL: '/api' },
    },
  ],
});
