import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Keep the rendering OS, browser and fonts identical on workstations and CI.
const image = 'mcr.microsoft.com/playwright:v1.65.1-noble@sha256:1507cbfc550a63a6b7396791ca4f00df17beb56342d2447b3f106c306f525579';
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
