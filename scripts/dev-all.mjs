import { spawn } from 'node:child_process';
import process from 'node:process';

const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const children = [];
let stopping = false;
let exitCode = 0;
let remaining = 0;

function writeOutput(label, stream, output) {
  const lines = output.toString().split(/(?<=\n)/);

  for (const line of lines) {
    if (line.length > 0) {
      stream.write(`[${label}] ${line}`);
    }
  }
}

function stopChildren(signal = 'SIGTERM') {
  if (stopping) {
    return;
  }

  stopping = true;

  for (const child of children) {
    if (!child.killed) {
      child.kill(signal);
    }
  }
}

function startTarget(label, script) {
  const child = spawn(npmCommand, ['run', script], {
    cwd: process.cwd(),
    env: process.env,
    stdio: ['inherit', 'pipe', 'pipe'],
  });

  children.push(child);
  remaining += 1;

  child.stdout.on('data', (output) => writeOutput(label, process.stdout, output));
  child.stderr.on('data', (output) => writeOutput(label, process.stderr, output));

  child.on('error', (error) => {
    if (!stopping) {
      exitCode = 1;
      process.stderr.write(`[${label}] ${error.message}\n`);
      stopChildren();
    }
  });

  child.on('exit', (code, signal) => {
    remaining -= 1;

    if (!stopping && (code ?? 1) !== 0) {
      exitCode = code ?? 1;
      process.stderr.write(`[${label}] exited with ${signal ?? `code ${code}`}\n`);
      stopChildren();
    }

    if (remaining === 0) {
      process.exit(exitCode);
    }
  });
}

process.once('SIGINT', () => stopChildren('SIGINT'));
process.once('SIGTERM', () => stopChildren('SIGTERM'));

startTarget('chrome', 'dev:chrome');
startTarget('firefox', 'dev:firefox');
