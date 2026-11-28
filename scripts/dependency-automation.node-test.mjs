import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

const readYaml = (path) => parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'));

test('Dependabot uses the lockfile-aware ecosystems for the workspace and scraper', () => {
  const { updates } = readYaml('.github/dependabot.yml');
  assert.ok(updates.some((entry) => entry['package-ecosystem'] === 'npm' && entry.directory === '/'));
  const scraper = updates.filter((entry) => entry.directory === '/services/scraper');
  assert.deepEqual(scraper.map((entry) => entry['package-ecosystem']), ['uv']);
});

test('CI covers PR updates without branch or path filters and verifies both lockfiles', () => {
  const workflow = readYaml('.github/workflows/ci.yml');
  const pullRequest = workflow.on.pull_request;
  assert.deepEqual(Object.keys(pullRequest), ['types']);
  for (const type of ['opened', 'synchronize', 'reopened', 'edited']) {
    assert.ok(pullRequest.types.includes(type), `Missing pull_request ${type} trigger`);
  }
  assert.equal(workflow.on.pull_request_target, undefined);
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  for (const job of Object.values(workflow.jobs)) assert.equal(job.if, undefined);
  assert.match(workflow.jobs.check.steps.map((step) => step.run).join('\n'), /pnpm install --frozen-lockfile/);
  assert.match(workflow.jobs['scraper-check'].steps.map((step) => step.run).join('\n'), /uv lock --check/);
});
