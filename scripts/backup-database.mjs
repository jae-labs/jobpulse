import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function databaseTarget(env) {
  if (!env.SUPABASE_DB_URL) return { args: ['--linked'], env };
  const url = new URL(env.SUPABASE_DB_URL);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname || !url.username || url.search || url.hash) {
    throw new Error('Use a PostgreSQL URL without query parameters or fragments');
  }
  const password = url.password ? decodeURIComponent(url.password) : env.SUPABASE_DB_PASSWORD;
  url.password = '';
  const safeEnv = { ...env, SUPABASE_DB_PASSWORD: password };
  delete safeEnv.SUPABASE_DB_URL;
  return { args: ['--db-url', url.toString()], env: safeEnv };
}

export function backupDatabase(env = process.env) {
  const target = databaseTarget(env);
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
  const directory = env.BACKUP_DIR || `.backups/jobpulse-${stamp}`;
  process.umask(0o077);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  for (const [file, flags] of [['roles.sql', ['--role-only']], ['schema.sql', []], ['data.sql', ['--data-only', '--use-copy']]]) {
    const result = spawnSync('supabase', ['db', 'dump', ...target.args, ...flags, '-f', `${directory}/${file}`],
      { env: target.env, stdio: 'inherit' });
    if (result.error || result.status !== 0) throw new Error('Database backup failed');
  }
  process.stdout.write(`Database backup completed: ${directory}\nStorage objects require a separate backup.\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) backupDatabase();
