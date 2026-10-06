import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hasTranslation } from './check-translation-keys.mjs';

test('object labels and missing translation keys fail while plural text is accepted', () => {
  const bundle = { jobs: { inspector: { title: 'Details' }, count_one: 'One', count_other: 'Many' } };
  assert.equal(hasTranslation(bundle, 'jobs.inspector'), false);
  assert.equal(hasTranslation(bundle, 'jobs.missing'), false);
  assert.equal(hasTranslation(bundle, 'jobs.inspector.title'), true);
  assert.equal(hasTranslation(bundle, 'jobs.count'), true);
});
