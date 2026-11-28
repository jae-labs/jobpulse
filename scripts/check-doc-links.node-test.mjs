import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localLinkTargets, markdownAnchors, checkDocLinks } from './check-doc-links.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('resolves local links and skips anchors, external links, and fenced examples', () => {
  assert.deepEqual(localLinkTargets('/repo/docs/guide.md', '[Schema](SCHEMA.md#owner) [UI](../packages/ui/DESIGN.md) [Web](https://example.invalid) [Section](#section)\n```\n[Example](missing.md)\n```'),
    ['/repo/docs/SCHEMA.md', '/repo/packages/ui/DESIGN.md']);
});

test('heading anchors include duplicate suffixes, Unicode and explicit IDs', () => {
  assert.deepEqual([...markdownAnchors('# Setup\n## Setup\n## Café & `tools`\n<a id="custom"></a>\n```\n# Hidden\n```')],
    ['setup', 'setup-1', 'café--tools', 'custom']);
});

test('maintained guides need complete index metadata and valid anchors', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'jobpulse-docs-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const dir of ['docs', 'packages/ui', 'services/scraper']) mkdirSync(join(root, dir), { recursive: true });
  for (const file of ['README.md', 'AGENTS.md']) writeFileSync(join(root, file), '# Root\n');
  writeFileSync(join(root, 'docs/GUIDE.md'), '# Setup\n[Local](#setup)\n');
  const index = join(root, 'docs/README.md');
  writeFileSync(index, '| [Guide](GUIDE.md) | change | owner | |\n');
  assert.throws(() => checkDocLinks(root), /missing documentation index metadata/);
  writeFileSync(index, '| [Guide](GUIDE.md#absent) | change | owner | Current policy |\n');
  assert.throws(() => checkDocLinks(root), /missing anchor/);
  writeFileSync(index, '| [Guide](GUIDE.md#setup) | change | owner | Current policy |\n');
  assert.doesNotThrow(() => checkDocLinks(root));
  writeFileSync(join(root, 'docs/GUIDE.md'), '# Setup\n[Broken](#missing)\n');
  assert.throws(() => checkDocLinks(root), /missing anchor/);
});
