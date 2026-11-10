import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: { baseURL: 'http://localhost:5174', viewport: { width: 1400, height: 900 } },
  webServer: { command: 'npm run dev', url: 'http://localhost:5174', reuseExistingServer: !process.env.CI, timeout: 120_000 },
  projects: [
    { name: 'chrome', use: { ...devices['Desktop Chrome'], channel: 'chrome', viewport: { width: 1400, height: 900 } } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'], viewport: { width: 1400, height: 900 } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'], viewport: { width: 1400, height: 900 } } },
    // Edge ships with Windows; only test it there.
    ...(process.platform === 'win32'
      ? [{ name: 'edge', use: { ...devices['Desktop Edge'], channel: 'msedge', viewport: { width: 1400, height: 900 } } }]
      : []),
  ],
});
