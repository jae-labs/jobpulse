import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizePythonModels } from './normalize-python-models.mjs';

test('model order is independent of database discovery order and preserves fields', () => {
  const prefix = 'from pydantic import BaseModel\n';
  const first = 'class PublicA(BaseModel):\n    owner: str\n';
  const second = 'class PublicB(TypedDict):\n    id: int\n';
  const canonical = normalizePythonModels(`${prefix}\n${first}\n${second}`);
  assert.equal(normalizePythonModels(`${prefix}\n${second}\n${first}`), canonical);
  assert.equal(normalizePythonModels(canonical), canonical);
  assert.ok(canonical.includes(first.trimEnd()));
  assert.ok(canonical.includes(second.trimEnd()));
  assert.notEqual(normalizePythonModels(`${prefix}\n${first.replace('str', 'int')}\n${second}`), canonical);
});

test('unexpected inheritance and duplicate models fail generation', () => {
  assert.throws(() => normalizePythonModels('class Child(PublicA):\n    pass\n'), /Unexpected/);
  assert.throws(() => normalizePythonModels('class A(BaseModel):\n    pass\n\nclass A(TypedDict):\n    pass\n'), /Duplicate/);
});
