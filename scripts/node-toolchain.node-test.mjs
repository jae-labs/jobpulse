import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { parse } from 'yaml';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const require = createRequire(import.meta.url);
const miseNode = read('mise.toml').match(/^node = "([\d.]+)"$/m)?.[1];
const workflow = parse(read('.github/workflows/ci.yml'));
const domNodeRange = require('jsdom/package.json').engines.node;

function supportsPinnedRelease(version, range) {
  const parts = version.split('.').map(Number);
  return range.split(' || ').some((alternative) => {
    const match = alternative.match(/^(\^|>=)(\d+)\.(\d+)\.(\d+)$/);
    assert.ok(match, `Unsupported Node engine clause: ${alternative}`);
    const minimum = match.slice(2).map(Number);
    if (match[1] === '^' && parts[0] !== minimum[0]) return false;
    for (let index = 0; index < parts.length; index += 1) {
      if (parts[index] !== minimum[index]) return parts[index] > minimum[index];
    }
    return true;
  });
}

test('local Node pin supports the installed DOM test runtime', () => {
  assert.ok(miseNode, 'mise.toml must pin a Node release');
  assert.ok(supportsPinnedRelease(miseNode, domNodeRange),
    `Node ${miseNode} does not satisfy jsdom's ${domNodeRange}`);
});

test('CI Node pins match the local toolchain', () => {
  const versions = Object.values(workflow.jobs).flatMap((job) =>
    (job.steps ?? []).filter((step) => step.uses?.startsWith('actions/setup-node@'))
      .map((step) => step.with?.['node-version']));
  assert.ok(versions.length > 0, 'CI must configure Node');
  for (const version of versions) assert.equal(version, miseNode);
});
