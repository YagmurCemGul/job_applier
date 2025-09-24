// @ts-check
import { defineConfig } from '@playwright/test';

const isCI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  timeout: 60 * 1000,
  retries: isCI ? 1 : 0,
  reporter: [['list']],
  use: {
    headless: isCI ? true : false,
    viewport: { width: 1280, height: 720 },
    ignoreHTTPSErrors: true,
    actionTimeout: 0
  }
});
