import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

function fixture(t) {
  const root = mkdtempSync(resolve(tmpdir(), 'jobpulse-scraper-log-'));
  mkdirSync(`${root}/scripts`);
  const script = `${root}/scripts/run-scraper.mjs`;
  copyFileSync(new URL('./run-scraper.mjs', import.meta.url), script);
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return { root, script };
}

test('captures both streams while preserving stdout, arguments, environment and failure status', (t) => {
  const { root, script } = fixture(t);
  const result = spawnSync(process.execPath, [script, 'scrape', process.execPath, '-e',
    'process.stdout.write(JSON.stringify({arg:process.argv[1],unbuffered:process.env.PYTHONUNBUFFERED})); process.stderr.write("synthetic diagnostic\\n"); process.exitCode=7;',
    'value with spaces'], { encoding: 'utf8', cwd: tmpdir() });
  assert.equal(result.status, 7);
  assert.deepEqual(JSON.parse(result.stdout), { arg: 'value with spaces', unbuffered: '1' });
  assert.match(result.stderr, /\[LOG\]/);
  assert.match(result.stderr, /synthetic diagnostic/);
  const files = readdirSync(`${root}/logs`);
  assert.equal(files.length, 1);
  const path = `${root}/logs/${files[0]}`;
  const log = readFileSync(path, 'utf8');
  assert.match(log, /synthetic diagnostic/);
  assert.match(log, /value with spaces/);
  assert.match(log, /exit=7/);
  assert.equal(statSync(path).mode & 0o777, 0o600);
});

test('concurrent invocations keep separate log files and record successful completion', async (t) => {
  const { root, script } = fixture(t);
  const children = [1, 2].map((number) => spawn(process.execPath,
    [script, 'scrape-worker', process.execPath, '-e', `process.stdout.write('synthetic-${number}');`],
    { stdio: 'ignore' }));
  const results = await Promise.all(children.map((child) => once(child, 'close')));
  assert.ok(results.every(([code]) => code === 0));
  const logs = readdirSync(`${root}/logs`).map((name) => readFileSync(`${root}/logs/${name}`, 'utf8'));
  assert.equal(logs.length, 2);
  for (const number of [1, 2]) assert.equal(logs.filter((log) => log.includes(`synthetic-${number}`)).length, 1);
  assert.ok(logs.every((log) => log.includes('exit=0')));
});

test('interrupting the logger forwards the signal and retains the interrupted exit status', async (t) => {
  const { root, script } = fixture(t);
  const child = spawn(process.execPath, [script, 'scrape', process.execPath, '-e',
    'process.stdout.write("ready\\n"); setInterval(()=>{},1000);']);
  t.after(() => { if (child.exitCode === null) child.kill('SIGKILL'); });
  child.stderr.resume();
  await once(child.stdout, 'data');
  const closed = once(child, 'close');
  child.kill('SIGTERM');
  const [code] = await closed;
  assert.equal(code, 143);
  const [name] = readdirSync(`${root}/logs`);
  assert.match(readFileSync(`${root}/logs/${name}`, 'utf8'), /exit=143/);
});

test('missing executable fails and still closes its log', (t) => {
  const { root, script } = fixture(t);
  const result = spawnSync(process.execPath, [script, 'scrape', `${root}/missing-command`], { encoding: 'utf8' });
  assert.notEqual(result.status, 0);
  const [name] = readdirSync(`${root}/logs`);
  assert.match(readFileSync(`${root}/logs/${name}`, 'utf8'), /log_error/);
  assert.match(readFileSync(`${root}/logs/${name}`, 'utf8'), /log_end/);
});
