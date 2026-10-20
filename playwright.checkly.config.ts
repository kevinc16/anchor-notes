import { defineConfig } from '@playwright/test';
import type { ChecklyReporterOptions } from '@checkly/playwright-reporter';

const uploadToCheckly =
  process.env.CI === 'true' &&
  process.env.CHECKLY_UPLOAD === 'true' &&
  Boolean(process.env.CHECKLY_API_KEY?.trim() && process.env.CHECKLY_ACCOUNT_ID?.trim());

export default defineConfig({
  reporter: [
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
});
