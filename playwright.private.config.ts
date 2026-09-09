import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './private-e2e',
  outputDir: '/private/tmp/promptprint-private-20260909/test-evidence/results',
  timeout: 210_000,
  expect: { timeout: 12_000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [['list']],
  use: { trace: 'off', screenshot: 'off', video: 'off' },
});
