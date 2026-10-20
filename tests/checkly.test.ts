import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

test.each([false, true])(
  'uploads a saved blob report without rerunning a test with failure=%s',
  (fail) => {
    const dir = mkdtempSync(path.join(tmpdir(), 'anchor-checkly-reporter-'));
    const require = createRequire(import.meta.url);
    const cli = require.resolve('@playwright/test/cli');
    try {
      const marker = path.join(dir, 'executions');
      writeFileSync(
        path.join(dir, 'smoke.spec.ts'),
        `
        import { test, expect } from ${JSON.stringify(require.resolve('@playwright/test'))};
        import { appendFileSync } from 'node:fs';
        test('synthetic reporter smoke', () => {
          appendFileSync(${JSON.stringify(marker)}, 'ran\\n');
          expect(${fail}).toBe(false);
        });
      `,
      );
      writeFileSync(
        path.join(dir, 'playwright.config.ts'),
        `
        import base from ${JSON.stringify(path.resolve('playwright.config.ts'))};
        export default {
          ...base, testDir: ${JSON.stringify(dir)}, retries: 0,
          outputDir: ${JSON.stringify(path.join(dir, 'results'))},
          reporter: base.reporter.map(([name, options]) => [name, {
            ...options, outputDir: ${JSON.stringify(path.join(dir, 'blob'))},
            outputFolder: ${JSON.stringify(path.join(dir, 'html'))}
          }]),
        };
      `,
      );
      const result = spawnSync(process.execPath, [cli, 'test', '-c', path.join(dir, 'playwright.config.ts')], {
        encoding: 'utf8',
        timeout: 20_000,
        env: { ...process.env, CI: 'true', CHECKLY_UPLOAD: '', CHECKLY_API_KEY: '', CHECKLY_ACCOUNT_ID: '' },
      });
      expect(result.status, result.stdout + result.stderr).toBe(fail ? 1 : 0);
      expect(readFileSync(path.join(dir, 'html/index.html'), 'utf8')).toContain('<html');
      writeFileSync(
        path.join(dir, 'upload.config.ts'),
        `
        import base from ${JSON.stringify(path.resolve('playwright.checkly.config.ts'))};
        export default { ...base, reporter: base.reporter.map(([name, options]) => [
          ${JSON.stringify(require.resolve('@checkly/playwright-reporter'))},
          { ...options, outputDir: ${JSON.stringify(path.join(dir, 'report'))} }
        ]) };
      `,
      );
      const upload = spawnSync(
        process.execPath,
        [cli, 'merge-reports', '-c', path.join(dir, 'upload.config.ts'), path.join(dir, 'blob')],
        {
          encoding: 'utf8',
          timeout: 20_000,
          env: {
            ...process.env,
            CI: 'true',
            CHECKLY_UPLOAD: 'true',
            CHECKLY_API_KEY: 'synthetic-reporter-key',
            CHECKLY_ACCOUNT_ID: 'synthetic-reporter-account',
            CHECKLY_REPORTER_DRY_RUN: 'true',
          },
        },
      );
      expect(upload.status, upload.stdout + upload.stderr).toBe(0);
      expect(readFileSync(path.join(dir, 'report/checkly-report.zip')).length).toBeGreaterThan(0);
      const report = JSON.parse(readFileSync(path.join(dir, 'report/checkly-report.json'), 'utf8'));
      expect(report.stats.unexpected).toBe(fail ? 1 : 0);
      expect(readFileSync(marker, 'utf8')).toBe('ran\n');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  30_000,
);

test.each([
  { ci: '', enabled: 'true', key: 'synthetic-key', account: 'synthetic-account', upload: false },
  { ci: 'true', enabled: '', key: 'synthetic-key', account: 'synthetic-account', upload: false },
  { ci: 'true', enabled: 'false', key: 'synthetic-key', account: 'synthetic-account', upload: false },
  { ci: 'true', enabled: 'true', key: '', account: 'synthetic-account', upload: false },
  { ci: 'true', enabled: 'true', key: 'synthetic-key', account: '', upload: false },
  { ci: 'true', enabled: 'true', key: 'synthetic-key', account: 'synthetic-account', upload: true },
])('Checkly upload gate: $ci / $enabled / $upload', async ({ ci, enabled, key, account, upload }) => {
  vi.stubEnv('CI', ci);
  vi.stubEnv('CHECKLY_UPLOAD', enabled);
  vi.stubEnv('CHECKLY_API_KEY', key);
  vi.stubEnv('CHECKLY_ACCOUNT_ID', account);
  vi.resetModules();
  const { default: config } = await import('../playwright.checkly.config');
  const reporters = config.reporter;
  if (!Array.isArray(reporters)) throw new Error('Expected configured reporters');
  expect(reporters.some(([name]) => name === '@checkly/playwright-reporter')).toBe(upload);
  const { default: testConfig } = await import('../playwright.config');
  if (!Array.isArray(testConfig.reporter)) throw new Error('Expected configured reporters');
  expect(testConfig.reporter.some(([name]) => name === '@checkly/playwright-reporter')).toBe(false);
});

test.each([
  {
    log: '[🦝 Checkly] 🔗 Test Session: \u001b[4mhttps://chkly.link/l/example123\u001b[0m\n',
    enabled: true,
    url: 'https://chkly.link/l/example123',
  },
  {
    log: '\u001b[32mView test results: https://app.checklyhq.com/test-sessions/session_123\u001b[0m\n',
    enabled: true,
    url: 'https://app.checklyhq.com/test-sessions/session_123',
  },
  { log: 'Upload failed\nhttps://example.com/test-sessions/untrusted\n', enabled: true, url: '' },
  { log: 'https://app.checklyhq.com/test-sessions/session_123', enabled: false, url: '' },
  { log: undefined, enabled: true, url: '' },
])('publishes a safe session link or reports unavailable: $enabled / $url', ({ log, enabled, url }) => {
  const dir = mkdtempSync(path.join(tmpdir(), 'anchor-checkly-'));
  try {
    const logFile = path.join(dir, 'run.log');
    const output = path.join(dir, 'output');
    const summary = path.join(dir, 'summary');
    if (log !== undefined) writeFileSync(logFile, log);
    const result = spawnSync(process.execPath, ['scripts/summarize-checkly.mjs', logFile], {
      encoding: 'utf8',
      env: { ...process.env, CHECKLY_UPLOAD: String(enabled), GITHUB_OUTPUT: output, GITHUB_STEP_SUMMARY: summary },
    });
    expect(result.status, result.stderr).toBe(0);
    expect(readFileSync(output, 'utf8')).toBe(`session-url=${url}\n`);
    const text = readFileSync(summary, 'utf8');
    if (url) expect(text).toContain(`[View Checkly test session](${url})`);
    else expect(text).toContain(enabled ? 'unavailable' : 'skipped');
    if (enabled && !url) expect(result.stdout).toContain('::warning::');
    expect(text).not.toContain('example.com');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
