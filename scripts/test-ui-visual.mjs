import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep the rendering OS, browser and fonts identical on workstations and CI.
const image = 'mcr.microsoft.com/playwright:v1.64.0-noble@sha256:06a9939e57531807f8d5fd76ce44b53165ffb7d7501d87ab10e285c20b1e971f';
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
