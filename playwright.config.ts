import { defineConfig, devices } from '@playwright/test';

const previewCommand = process.env.CI
  ? 'npm run preview:pages'
  : `${process.execPath} scripts/serve-pages.mjs`;

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:4173/WriterToolkit/',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: previewCommand,
    url: 'http://127.0.0.1:4173/WriterToolkit/',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});
