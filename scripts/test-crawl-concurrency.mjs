// Local queue fixtures verify row locking and crash recovery without resetting developer data.
import { spawn, spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const project = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(readFileSync(`${root}/supabase/config.toml`, 'utf8'))?.[1];
if (!project) throw new Error('Missing local project');
const context = spawnSync('docker', ['context', 'inspect', '--format', '{{ .Endpoints.docker.Host }}'], { encoding: 'utf8' });
const local = (value) => /^(?:unix|npipe):\/\//.test(value ?? '');
if (context.status || !local(context.stdout.trim()) || (process.env.DOCKER_HOST && !local(process.env.DOCKER_HOST))) {
  throw new Error('Crawl tests require a local Docker socket');
}
const command = ['exec', '-i', `supabase_db_${project}`, 'psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', 'postgres'];
const prefix = "SET ROLE service_role; SELECT set_config('request.jwt.claims','{\"role\":\"service_role\"}',false);\n";
function sql(input) {
  const result = spawnSync('docker', command, { input: prefix + input, encoding: 'utf8' });
  if (result.status) throw new Error(result.stderr || 'Local SQL command failed');
  return result.stdout.trim().split('\n').filter((line) => line && !line.startsWith('{"role"'));
}
const keys = Array.from({ length: 3 }, () => `synthetic-concurrency:${randomUUID()}`);
const quoted = keys.map((key) => `'${key}'`).join(',');
let session;
try {
  const autoKey = `synthetic-auto-concurrency:${randomUUID()}`;
  const targets = JSON.stringify([{ source_key: autoKey, target: { employer: 'Synthetic' }, priority: 100 }]);
  {
    let starter;
    try {
      starter = spawn('docker', command, { stdio: ['pipe', 'pipe', 'pipe'] });
      let startupOutput = '';
      let startupErrors = '';
      starter.stderr.on('data', (data) => { startupErrors += data; });
      const startupFinished = new Promise((resolve, reject) => {
        starter.on('error', reject);
        starter.on('close', (code) => code ? reject(new Error(startupErrors || 'Starter failed')) : resolve());
      });
      const seeded = new Promise((resolve, reject) => {
        starter.stdout.on('data', (data) => {
          startupOutput += data;
          if (startupOutput.includes('seeded=1')) resolve();
        });
        starter.on('error', reject);
        starter.on('close', () => { if (!startupOutput.includes('seeded=1')) reject(new Error('Idle starter did not seed')); });
      });
      starter.stdin.end(prefix + `BEGIN; SELECT 'seeded=' || public.enqueue_crawls_if_idle('${targets}'); SELECT pg_sleep(3); COMMIT;`);
      await seeded;
      if (sql(`SELECT public.enqueue_crawls_if_idle('${targets}');`)[0] !== '0') throw new Error('Concurrent startup seeded twice');
      await startupFinished;
      if (sql(`SELECT count(*) FROM public.crawl_tasks WHERE source_key='${autoKey}';`)[0] !== '1') throw new Error('Startup lost its source task');
      console.log('PASS concurrent automatic starters seed exactly one source cycle');
    } finally {
      if (starter && starter.exitCode === null) starter.kill('SIGTERM');
      sql(`DELETE FROM public.crawl_tasks WHERE source_key='${autoKey}';`);
    }
  }
  const ids = keys.map((key) => sql(`SELECT public.enqueue_crawl('${key}','{"employer":"Synthetic"}',100,'1970-01-01');`)[0]);
  session = spawn('docker', command, { stdio: ['pipe', 'pipe', 'pipe'] });
  let output = '';
  let errors = '';
  session.stderr.on('data', (data) => { errors += data; });
  const finished = new Promise((resolve, reject) => {
    session.on('error', reject);
    session.on('close', (code) => code ? reject(new Error(errors || 'Lock holder failed')) : resolve());
  });
  const claimed = new Promise((resolve, reject) => {
    session.stdout.on('data', (data) => {
      output += data;
      const line = output.split('\n').find((value) => value.startsWith('{"id"'));
      if (line) resolve(JSON.parse(line));
    });
    session.on('error', reject);
    session.on('close', () => { if (!output.includes('{"id"')) reject(new Error('Lock holder did not claim')); });
  });
  session.stdin.end(prefix + "BEGIN; SELECT json_build_object('id',id,'token',lease_token) FROM public.claim_crawl(120); SELECT pg_sleep(3); ROLLBACK;\n");
  const first = await claimed;
  const second = JSON.parse(sql("BEGIN; SELECT json_build_object('id',id,'token',lease_token) FROM public.claim_crawl(120); ROLLBACK;")[0]);
  if (!ids.includes(first.id) || !ids.includes(second.id) || first.id === second.id) throw new Error('Concurrent claim lost row-lock isolation');
  await finished;
  console.log('PASS concurrent claims skip another worker’s row lock');

  const orphan = JSON.parse(sql("SELECT json_build_object('id',id,'token',lease_token) FROM public.claim_crawl(120);")[0]);
  if (!ids.includes(orphan.id)) throw new Error('Crash fixture claimed unrelated work');
  sql(`UPDATE public.crawl_tasks SET lease_until=now()-interval '1 second' WHERE id='${orphan.id}';`);
  const reclaimed = JSON.parse(sql("SELECT json_build_object('id',id,'token',lease_token) FROM public.claim_crawl(120);")[0]);
  // Other equally due fixtures can precede the expired row; reserve them before claiming again.
  let recovered = reclaimed;
  for (let index = 0; recovered.id !== orphan.id && index < 2; index += 1) {
    if (!ids.includes(recovered.id)) throw new Error('Recovery fixture claimed unrelated work');
    recovered = JSON.parse(sql("SELECT json_build_object('id',id,'token',lease_token) FROM public.claim_crawl(120);")[0]);
  }
  if (recovered.id !== orphan.id || recovered.token === orphan.token) throw new Error('Crashed worker lease not reclaimed');
  const stale = sql(`SELECT public.finish_crawl('${orphan.id}','${orphan.token}','complete','{}');`)[0];
  if (stale !== 'f') throw new Error('Stale worker completed reclaimed work');
  const current = sql(`SELECT public.finish_crawl('${recovered.id}','${recovered.token}','complete','{}');`)[0];
  if (current !== 't') throw new Error('Current worker cannot complete');
  console.log('PASS committed orphan work recovers and rejects stale completion');
} finally {
  if (session && session.exitCode === null) session.kill('SIGTERM');
  sql(`DELETE FROM public.crawl_runs WHERE task_id IN (SELECT id FROM public.crawl_tasks WHERE source_key IN (${quoted})); DELETE FROM public.crawl_tasks WHERE source_key IN (${quoted});`);
}
