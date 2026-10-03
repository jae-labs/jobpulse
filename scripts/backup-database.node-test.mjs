import { test } from 'node:test';
import assert from 'node:assert/strict';
import { databaseTarget } from './backup-database.mjs';

test('database password never enters command arguments or a credential-bearing URL', () => {
  const target = databaseTarget({ SUPABASE_DB_URL: 'postgresql://postgres:synthetic%40password@localhost:54322/postgres' });
  assert.equal(target.args[1], 'postgresql://postgres@localhost:54322/postgres');
  assert.equal(target.env.SUPABASE_DB_PASSWORD, 'synthetic@password');
  assert.equal(target.env.SUPABASE_DB_URL, undefined);
  assert.equal(JSON.stringify(target.args).includes('password'), false);
});
test('linked backups and password-free URLs retain environment credentials', () => {
  assert.deepEqual(databaseTarget({}).args, ['--linked']);
  assert.equal(databaseTarget({ SUPABASE_DB_URL: 'postgres://postgres@localhost/postgres', SUPABASE_DB_PASSWORD: 'synthetic' }).env.SUPABASE_DB_PASSWORD, 'synthetic');
});
test('rejects query-based credential transport', () => {
  assert.throws(() => databaseTarget({ SUPABASE_DB_URL: 'postgres://postgres@localhost/postgres?password=synthetic' }));
});
