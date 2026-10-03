import { test } from 'node:test';
import assert from 'node:assert/strict';
import { localLinkTargets } from './check-doc-links.mjs';

test('resolves local links and skips anchors, external links, and fenced examples', () => {
  assert.deepEqual(localLinkTargets('/repo/docs/guide.md', '[Schema](SCHEMA.md#owner) [UI](../packages/ui/DESIGN.md) [Web](https://example.invalid) [Section](#section)\n```\n[Example](missing.md)\n```'),
    ['/repo/docs/SCHEMA.md', '/repo/packages/ui/DESIGN.md']);
});
