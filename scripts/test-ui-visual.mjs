import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep the rendering OS, browser and fonts identical on workstations and CI.
const image = 'mcr.microsoft.com/playwright:v1.58.2-noble@sha256:6446946a1d9fd62d9ae501312a2d76a43ee688542b21622056a372959b65d63d';
const root = fileURLToPath(new URL('../', import.meta.url));
const update = process.argv.includes('--update');
const result = spawnSync('docker', [
  'run', '--rm', '--platform', 'linux/amd64', '--ipc=host',
  '--mount', `type=bind,source=${root},target=/workspace`,
  '--workdir', '/workspace/packages/ui', '--env', 'CI=1', image,
  'node', 'node_modules/@playwright/test/cli.js', 'test',
  ...(update ? ['--update-snapshots'] : []),
], { stdio: 'inherit' });
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
