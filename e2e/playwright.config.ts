import { fileURLToPath } from 'node:url';

import { defineConfig } from '@playwright/test';

const webPort = process.env.VIWEB_SMOKE_WEB_PORT ?? '3100';
const apiPort = process.env.VIWEB_SMOKE_API_PORT ?? '8100';
const baseURL = `http://127.0.0.1:${webPort}`;

export default defineConfig({
  testDir: '.',
  testMatch: '*.spec.ts',
  workers: 1,
  reporter: 'list',
  outputDir: '../test-results',
  use: {
    baseURL,
    browserName: 'chromium',
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `npm run dev -- --port ${webPort}`,
    cwd: fileURLToPath(new URL('..', import.meta.url)),
    env: { VITE_API_URL: `http://127.0.0.1:${apiPort}` },
    url: `${baseURL}/health/ready`,
    timeout: 30_000,
  },
});
