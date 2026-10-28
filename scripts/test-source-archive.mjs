import console from 'node:console';
import process from 'node:process';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, URL } from 'node:url';

const repo = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(path.join(tmpdir(), 'anchor-source-archive-'));
const checkout = path.join(temporary, 'checkout');
const rebuilt = path.join(temporary, 'rebuilt');
const run = (command, args, cwd = checkout) =>
  execFileSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const wxt = path.join(repo, 'node_modules/wxt/bin/wxt.mjs');
const sources = ['assets/', 'components/', 'entrypoints/', 'lib/', 'public/', 'styles/'];
const required = [
  'package.json',
  'package-lock.json',
  'wxt.config.ts',
  'tsconfig.json',
  '.nvmrc',
  'LICENSE',
  'README.md',
];
const unwanted = [
  'unrelated-local.txt',
  'local-transcript.json',
  'coverage/index.html',
  'playwright-report/index.html',
  'test-results/trace.txt',
  'blob-report/report.zip',
  'store-assets/private.txt',
  '.env.local',
  '.gh-token',
  'lib/private-local.json',
  'assets/private-local.txt',
  'lib/sourcep.ts',
  'lib/quotedprobe.ts',
  'lib/.env.local',
  'lib/.private/probe.txt',
];

try {
  mkdirSync(checkout);
  const tracked = run('git', ['ls-files', '-z'], repo).split('\0').filter(Boolean);
  for (const file of tracked) {
    const target = path.join(checkout, file);
    mkdirSync(path.dirname(target), { recursive: true });
    cpSync(path.join(repo, file), target);
  }
  const globNames = [
    'lib/source[probe].ts',
    ...(process.platform === 'win32' ? [] : ['lib/private-local.json|source.ts', 'lib/quoted"probe.ts']),
  ];
  for (const file of globNames) {
    writeFileSync(path.join(checkout, file), 'export {};\n');
    tracked.push(file);
  }
  run('git', ['init', '--quiet']);
  run('git', ['add', '.']);
  for (const file of unwanted) {
    const target = path.join(checkout, file);
    mkdirSync(path.dirname(target), { recursive: true });
    writeFileSync(target, 'Synthetic packaging probe; no private data.\n');
  }
  run('git', ['add', '--force', 'coverage/index.html', 'lib/.env.local', 'lib/.private/probe.txt']);
  symlinkSync(path.join(repo, 'node_modules'), path.join(checkout, 'node_modules'), 'junction');
  run(process.execPath, [wxt, 'zip', '--browser', 'firefox']);
  const output = path.join(checkout, '.output');
  const archives = readdirSync(output).filter((file) => file.endsWith('.zip'));
  const sourceArchive = archives.find((file) => file.endsWith('-sources.zip'));
  const extensionArchive = archives.find((file) => file.endsWith('-firefox.zip'));
  assert.ok(sourceArchive, 'Missing sources ZIP');
  assert.ok(extensionArchive, 'Missing Firefox extension ZIP');
  for (const archive of [sourceArchive, extensionArchive]) {
    const entries = run('unzip', ['-Z1', path.join(output, archive)])
      .trim()
      .split('\n');
    for (const file of unwanted) assert.ok(!entries.includes(file), `${archive} includes ${file}`);
    if (archive === sourceArchive) {
      for (const file of required) assert.ok(entries.includes(file), `Missing build input: ${file}`);
      for (const dir of sources) {
        for (const file of tracked.filter((file) => file.startsWith(dir))) {
          assert.ok(entries.includes(file), `Missing source input: ${file}`);
        }
      }
      assert.ok(!entries.some((file) => file.startsWith('.git/')), 'Git metadata must not be packaged');
    }
  }
  run('unzip', ['-q', path.join(output, sourceArchive), '-d', rebuilt]);
  assert.ok(!existsSync(path.join(rebuilt, '.git')), 'Rebuild must not depend on Git metadata');
  symlinkSync(path.join(repo, 'node_modules'), path.join(rebuilt, 'node_modules'), 'junction');
  run(process.execPath, [wxt, 'prepare'], rebuilt);
  run(process.execPath, [wxt, 'build', '--browser', 'firefox'], rebuilt);
  run(process.execPath, ['scripts/validate-firefox-build.mjs'], rebuilt);
  const originalBuild = path.join(output, 'firefox-mv2');
  const rebuiltOutput = path.join(rebuilt, '.output/firefox-mv2');
  const buildFiles = readdirSync(originalBuild, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(originalBuild, path.join(entry.parentPath, entry.name)))
    .sort();
  const rebuiltFiles = readdirSync(rebuiltOutput, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => path.relative(rebuiltOutput, path.join(entry.parentPath, entry.name)))
    .sort();
  assert.deepEqual(rebuiltFiles, buildFiles, 'Extracted sources must reproduce the output file list');
  for (const file of buildFiles) {
    assert.deepEqual(
      readFileSync(path.join(rebuiltOutput, file)),
      readFileSync(path.join(originalBuild, file)),
      `Extracted sources changed build output: ${file}`,
    );
  }
  assert.throws(
    () => run(process.execPath, [wxt, 'zip', '--browser', 'firefox'], rebuilt),
    /git ls-files/,
    'Source packaging without a Git checkout must fail closed',
  );
  run('git', ['init', '--quiet'], rebuilt);
  assert.throws(
    () => run(process.execPath, [wxt, 'zip', '--browser', 'firefox'], rebuilt),
    /Source packaging requires a Git checkout with tracked build inputs/,
    'Source packaging with an empty Git index must fail closed',
  );
  assert.ok(!existsSync(path.join(rebuilt, '.output', sourceArchive)), 'Failed packaging must not emit a source ZIP');
  console.log('Source packaging validated: local files excluded, build inputs present, extracted sources rebuild.');
} catch (error) {
  if (error.stdout) process.stderr.write(error.stdout);
  if (error.stderr) process.stderr.write(error.stderr);
  throw error;
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
