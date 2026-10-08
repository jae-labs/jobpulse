import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { closeSync, mkdirSync, openSync, writeSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { constants } from 'node:os';
import { fileURLToPath } from 'node:url';

const [task, command, ...args] = process.argv.slice(2);
if (!task || !/^[a-z0-9-]+$/.test(task) || !command) {
  process.stderr.write('Usage: node scripts/run-scraper.mjs TASK COMMAND [ARGS...]\n');
  process.exit(2);
}

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const directory = resolve(root, 'logs');
mkdirSync(directory, { recursive: true, mode: 0o700 });
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const path = resolve(directory, `${task}-${timestamp}-${randomUUID().slice(0, 8)}.log`);
const log = openSync(path, 'wx', 0o600);

function append(data) {
  const bytes = Buffer.isBuffer(data) ? data : Buffer.from(data);
  let offset = 0;
  while (offset < bytes.length) offset += writeSync(log, bytes, offset, bytes.length - offset);
}

append(`[log_start] ${new Date().toISOString()} task=${task}\n`);
process.stderr.write(`[LOG] ${path}\n`);
const child = spawn(command, args, {
  stdio: ['inherit', 'pipe', 'pipe'],
  env: { ...process.env, PYTHONUNBUFFERED: '1' },
});

for (const [input, output] of [[child.stdout, process.stdout], [child.stderr, process.stderr]]) {
  input.on('data', (data) => {
    append(data);
    if (!output.write(data)) {
      input.pause();
      output.once('drain', () => input.resume());
    }
  });
}

for (const signal of ['SIGINT', 'SIGTERM', 'SIGHUP']) {
  process.on(signal, () => child.kill(signal));
}

child.on('error', (error) => {
  const message = `[log_error] Could not start scraper command (${error.code ?? 'unknown'}).\n`;
  append(message);
  process.stderr.write(message);
});
child.on('close', (code, signal) => {
  const status = code ?? (signal ? 128 + constants.signals[signal] : 1);
  append(`\n[log_end] ${new Date().toISOString()} exit=${status}\n`);
  closeSync(log);
  process.exitCode = status;
});
