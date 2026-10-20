import { defineConfig } from '@playwright/test';
import type { ChecklyReporterOptions } from '@checkly/playwright-reporter';

const uploadToCheckly =
  process.env.CI === 'true' &&
  process.env.CHECKLY_UPLOAD === 'true' &&
  Boolean(process.env.CHECKLY_API_KEY?.trim() && process.env.CHECKLY_ACCOUNT_ID?.trim());

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  expect: {
    timeout: 5_000,
  },
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'playwright-report', open: 'never' }],
    ...(uploadToCheckly
      ? [
          [
            '@checkly/playwright-reporter',
            {
              sessionName: `Anchor Notes / ${process.env.GITHUB_HEAD_REF || process.env.GITHUB_REF_NAME || 'CI'} / ${process.env.GITHUB_RUN_ID || 'run'}.${process.env.GITHUB_RUN_ATTEMPT || '1'}`,
              showProgress: false,
              showSummaryTable: false,
              scrubbing: { autoDetect: true, envVars: ['CHECKLY_API_KEY'] },
            } satisfies ChecklyReporterOptions,
          ] as const,
        ]
      : []),
  ],
  outputDir: 'test-results',
  use: {
    trace: 'retain-on-failure',
    screenshot: process.env.CI ? 'on' : 'only-on-failure',
    video: 'retain-on-failure',
  },
});
