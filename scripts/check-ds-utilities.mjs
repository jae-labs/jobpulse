import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const read = (path) => readFileSync(join(root, path), 'utf8');

const tokenCss = read('packages/ui/src/tokens.css');
const appCss = read('src/index.css');

// Every `ds-*` name that maps to a real token or a package utility class.
const valid = new Set();
for (const match of tokenCss.matchAll(/--(?:color|radius|shadow)-ds-([a-z0-9-]+)\s*:/g)) valid.add(match[1]);
for (const match of appCss.matchAll(/--color-ds-([a-z0-9-]+)\s*:/g)) valid.add(match[1]);
for (const match of tokenCss.matchAll(/\.ds-([a-z0-9-]+)/g)) valid.add(match[1]);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\./.test(name)) out.push(path);
  }
  return out;
}

const offenders = new Map();
for (const file of [...walk(join(root, 'src')), ...walk(join(root, 'packages/ui/src'))]) {
  // Ignore CSS custom-property references such as var(--ds-color-text-primary).
  const source = readFileSync(file, 'utf8').replace(/--ds-[a-z0-9-]+/g, '');
  for (const match of source.matchAll(/\bds-([a-z0-9-]+)/g)) {
    const name = match[1];
    if (valid.has(name)) continue;
    const relative = file.slice(root.length);
    if (!offenders.has(name)) offenders.set(name, new Set());
    offenders.get(name).add(relative);
  }
}

if (offenders.size > 0) {
  console.error('Unknown design-system utilities. Use a token from packages/ui/src/tokens.css:');
  for (const [name, files] of [...offenders].sort()) {
    console.error(`  ds-${name} — ${[...files].join(', ')}`);
  }
  process.exit(1);
}

console.log('All ds-* utilities resolve to defined tokens or package classes.');
