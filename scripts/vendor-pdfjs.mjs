// Import a verified official release. Runtime/build never download code.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdirSync, cpSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { URL } from 'node:url';
import { tmpdir } from 'node:os';
import process from 'node:process';
const version = '6.5.438';
const checksum = 'fcbe9ba21d9911843e3502adc178a7f549a524a4055f887bedc942e5490c6ba1';
const archive = process.argv[2];
if (!archive || createHash('sha256').update(readFileSync(archive)).digest('hex') !== checksum) {
  throw new Error('Supply the verified pdfjs-6.5.438-dist.zip release archive.');
}
const target = new URL('../public/pdfjs/', import.meta.url);
const staging = join(tmpdir(), `anchor-pdfjs-${process.pid}`);
mkdirSync(staging);
try {
  execFileSync('unzip', ['-q', archive, '-d', staging]);
  mkdirSync(target, { recursive: true });
  cpSync(staging, target, { recursive: true, filter: (path) => !path.endsWith('.map') && !path.endsWith('.pdf') });
  const viewerPath = new URL('web/viewer.mjs', target);
  let viewer = readFileSync(viewerPath, 'utf8');
  for (const [before, after] of [
    ['value: "compressed.tracemonkey-pldi-09.pdf"', 'value: ""'],
    ['["enableScripting", {\n  value: true,', '["enableScripting", {\n  value: false,'],
    ['["disablePreferences", {\n  value: false,', '["disablePreferences", {\n  value: true,'],
  ]) {
    if (!viewer.includes(before)) throw new Error(`Upstream bootstrap changed: ${before}`);
    viewer = viewer.replace(before, after);
  }
  writeFileSync(viewerPath, viewer);
  writeFileSync(new URL('PROVENANCE.md', target), `# PDF.js ${version}\n\nSource: https://github.com/mozilla/pdf.js/releases/download/v${version}/pdfjs-${version}-dist.zip\n\nSHA-256: ${checksum}\n\nApache-2.0; see LICENSE and resource-specific notices. Maps and sample PDFs omitted.\nBootstrap defaults patched: empty defaultUrl, enableScripting=false, disablePreferences=true.\nReproduce with: node scripts/vendor-pdfjs.mjs /path/to/release.zip\nViewer integration and extension-origin restrictions live in entrypoints/pdf.\n`);
} finally {
  rmSync(staging, { recursive: true, force: true });
}
