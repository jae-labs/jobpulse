import { readFile, readdir } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../dist');
const manifest = JSON.parse(await readFile(resolve(root, '.vite/manifest.json'), 'utf8'));
const size = async file => gzipSync(await readFile(resolve(root, file))).length;
const assets = await readdir(resolve(root, 'assets'));
const budgets = [
  ['JobsMapView-', 300], ['JobsView-', 20], ['profileEmbedding.worker-', 175],
  ['maplibre-gl-worker-', 165],
];
let failed = false;
function check(label, bytes, kib) {
  console.log(`${label}: ${(bytes / 1024).toFixed(1)} KiB gzip / ${kib} KiB budget`);
  if (bytes > kib * 1024) failed = true;
}
for (const [prefix, budget] of budgets) {
  const files = assets.filter(file => file.startsWith(prefix) && file.endsWith('.js'));
  if (files.length !== 1) throw new Error(`Expected one ${prefix} JavaScript chunk`);
  check(prefix, await size(`assets/${files[0]}`), budget);
}
// Include all static imports, not just the small entry file. Lazy routes and
// workers have separate budgets and are excluded from the initial load.
const initialFiles = new Set();
function visit(key) {
  const item = manifest[key];
  if (!item || initialFiles.has(item.file)) return;
  initialFiles.add(item.file);
  for (const dependency of item.imports ?? []) visit(dependency);
}
for (const [key, item] of Object.entries(manifest)) if (item.isEntry) visit(key);
if ([...initialFiles].some(file => /\/sentry[-.]/.test(file))) {
  throw new Error('Optional Sentry SDK must remain outside the initial JavaScript graph');
}
check('Initial JavaScript graph', (await Promise.all([...initialFiles].map(size))).reduce((sum, n) => sum + n, 0), 275);
if (failed) process.exitCode = 1;
