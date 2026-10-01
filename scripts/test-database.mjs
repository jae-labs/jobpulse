// Local Docker only: never accepts hosted URLs/keys and never resets or migrates the developer database.
import { spawnSync } from 'node:child_process';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const config = readFileSync(`${root}/supabase/config.toml`, 'utf8');
const project = /^project_id\s*=\s*"([a-zA-Z0-9_-]+)"/m.exec(config)?.[1];
if (!project) throw new Error('Missing safe local Supabase project_id');
const container = `supabase_db_${project}`;
const args = process.argv.slice(2);
if (args.some((arg) => arg !== '--tenancy')) throw new Error('Usage: node scripts/test-database.mjs [--tenancy]');

// Do not let DOCKER_HOST/a remote Docker context turn local fixture writes into remote writes.
const context = spawnSync('docker', ['context', 'inspect', '--format', '{{ .Endpoints.docker.Host }}'], { encoding: 'utf8' });
const localEndpoint = (endpoint) => Boolean(endpoint && /^(?:unix|npipe):\/\//.test(endpoint));
if (context.status !== 0 || !localEndpoint(context.stdout?.trim()) ||
    (process.env.DOCKER_HOST && !localEndpoint(process.env.DOCKER_HOST))) {
  throw new Error('Database tests require a local Docker socket/pipe. Remote Docker endpoints are forbidden.');
}

function sql(input) {
  return spawnSync('docker', ['exec', '-i', container, 'psql', '-X', '--set', 'ON_ERROR_STOP=1',
    '--username', 'postgres', '--dbname', 'postgres', '--tuples-only', '--no-align'],
  { cwd: root, input, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 });
}
const migrations = readdirSync(`${root}/supabase/migrations`).filter((name) => name.endsWith('.sql'))
  .map((name) => name.split('_')[0]).sort();
const ledger = sql('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version;');
if (ledger.status !== 0) {
  throw new Error(`Local database unavailable. Start it with npm run db:start.\n${ledger.error?.message ?? ledger.stderr}`);
}
const applied = ledger.stdout.trim().split('\n').filter(Boolean);
if (JSON.stringify(applied) !== JSON.stringify(migrations)) {
  const pendingOnly = applied.every((version, index) => version === migrations[index]);
  const recovery = pendingOnly
    ? `Pending local migrations: ${migrations.slice(applied.length).join(', ')}.\nApply them without resetting data: supabase migration up --local\nThen rerun npm run db:test:tenancy.`
    : 'The local migration history diverges from this checkout. Back up local data and reconcile the checkout/history before rebuilding the local database.';
  throw new Error(`Local migration ledger differs from this checkout.\n${recovery}\nNo database tests were run against a stale schema.`);
}
const testDir = `${root}/supabase/tests`;
const files = readdirSync(testDir).filter((name) => name.endsWith('.sql') && (!args.includes('--tenancy') || name.startsWith('tenant_'))).sort();
if (!files.some((name) => name.startsWith('tenant_'))) throw new Error('Tenant regression suites are missing');
let failures = 0;
for (const file of files) {
  let input = readFileSync(`${testDir}/${file}`, 'utf8');
  if (file.startsWith('tenant_')) {
    const contract = readFileSync(`${testDir}/helpers/tenant_contract.sql`, 'utf8');
    const fixtures = file === 'tenant_catalog.sql' ? '' : readFileSync(`${testDir}/helpers/tenant_fixtures.sql`, 'utf8');
    input = `BEGIN;\nSET LOCAL statement_timeout='60s';\n${contract}\n${fixtures}\n${input}\nROLLBACK;\n`;
  }
  const result = sql(input);
  if (result.status !== 0) {
    failures++;
    console.error(`FAIL ${file}\n${result.error?.message ?? result.stderr}`);
  } else {
    console.log(`PASS ${file}`);
  }
}
if (failures) process.exitCode = 1;
