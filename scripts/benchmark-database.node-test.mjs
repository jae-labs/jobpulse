import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';

const source = readFileSync(new URL('./benchmark-database.mjs', import.meta.url), 'utf8')
  .replace(/^import .+;\n/gm, '');

function probe(project, dockerHost = 'unix:///synthetic/docker.sock') {
  const queries = [];
  const context = {
    process: { argv: ['node', 'probe', project], env: {} },
    randomUUID: () => 'synthetic-capacity-run',
    console: { log() {} },
    spawnSync(command, args, options) {
      assert.equal(command, 'docker');
      let stdout = '';
      if (args[0] === 'context') stdout = dockerHost;
      else if (args.includes('psql')) {
        queries.push(options.input);
        if (options.input.includes('json_agg')) stdout = '[{"id":4,"active":false}]';
        else if (options.input.includes('batch_ms')) stdout = '{"batch_ms":1,"processed":0}';
        else if (options.input.includes("->>'total'")) stdout = '1000';
      } else if (args.includes('sh') && args.at(-1).startsWith('cat /tmp/')) stdout = '0 0 1500';
      return { status: 0, stdout };
    },
  };
  runInNewContext(source, context);
  return queries;
}

test('capacity fixtures use canonical factors and restore a disabled scheduler', () => {
  const queries = probe('jobpulse-benchmark');
  const evaluations = queries.find(query => query.includes('INSERT INTO public.user_job_evaluations'));
  assert.match(evaluations, /"role_sector":"Data"/);
  assert.match(evaluations, /"sector":0\.75/);
  assert.doesNotMatch(evaluations, /role_domain|"domain"|"semantic":75/);
  const cleanup = queries.at(-1);
  assert.match(cleanup, /cron\.alter_job\(4,active:=false\)/);
  assert.doesNotMatch(cleanup, /active:=true/);
  assert.match(cleanup, /capacity-synthetic-capacity-run-job-/);
});

test('capacity probes reject development projects and remote Docker', () => {
  assert.throws(() => probe('jobpulse'), /disposable/);
  assert.throws(() => probe('jobpulse-benchmark', 'tcp://remote.invalid:2375'), /Local Docker only/);
});
