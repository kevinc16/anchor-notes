import { appendFileSync, readFileSync } from 'node:fs';
import { stripVTControlCharacters } from 'node:util';
import process from 'node:process';
import console from 'node:console';

const enabled = process.env.CHECKLY_UPLOAD === 'true';
let sessionUrl = '';
if (enabled) {
  try {
    const log = stripVTControlCharacters(readFileSync(process.argv[2], 'utf8'));
    sessionUrl =
      log.match(
        /(?:View test results|Test Session):\s+(https:\/\/(?:app\.checklyhq\.com\/test-sessions|chkly\.link\/l)\/[\w-]+)(?=\s|$)/,
      )?.[1] || '';
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}

const message = sessionUrl
  ? `[View Checkly test session](${sessionUrl})`
  : enabled
    ? 'Checkly session unavailable. Check the Checkly upload step logs for upload errors.'
    : 'Checkly upload skipped: credentials are missing or this run is not enabled for uploads.';

if (enabled && !sessionUrl) console.log(`::warning::${message}`);
appendFileSync(process.env.GITHUB_OUTPUT, `session-url=${sessionUrl}\n`);
appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## Checkly\n\n${message}\n`);
