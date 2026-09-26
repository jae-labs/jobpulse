// Disposable end-to-end deletion test against the local Supabase stack only.
// Run after `supabase migration up --local` and `supabase functions serve delete-account`.
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';

const status = spawnSync('supabase', ['status', '-o', 'env'], {
  encoding: 'utf8',
  env: { ...process.env, SUPABASE_TELEMETRY_DISABLED: '1' },
});
if (status.status !== 0) throw new Error('Local Supabase status is unavailable');
const variables = Object.fromEntries(status.stdout.split('\n').flatMap((line) => {
  const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
  return match ? [[match[1], match[2].replace(/^"|"$/g, '')]] : [];
}));

const url = variables.API_URL;
const anonKey = variables.ANON_KEY;
const serviceKey = variables.SERVICE_ROLE_KEY;
if (!url?.startsWith('http://127.0.0.1:') || !anonKey || !serviceKey) {
  throw new Error('This test requires the local Supabase API and keys');
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const client = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
const email = `delete-test-${randomUUID()}@example.invalid`;
const password = randomUUID();
let userId;
let documentPath;
let avatarPath;

function assertNoError(result, step) {
  if (result.error) throw new Error(`${step}: ${result.error.message}`);
  return result.data;
}

try {
  const created = assertNoError(await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  }), 'Create disposable user');
  userId = created.user.id;
  documentPath = `${userId}/cv/test.pdf`;
  avatarPath = `${userId}/avatar`;

  assertNoError(await admin.from('authorized_users').insert({
    user_id: userId, email, role: 'member', status: 'accepted',
  }), 'Authorize disposable user');
  assertNoError(await admin.from('authorized_users').insert({
    email: `pending-${randomUUID()}@example.invalid`, role: 'member', status: 'pending', invited_by: userId,
  }), 'Create pending invitation');
  assertNoError(await admin.from('user_profiles').insert({ user_id: userId, name: 'Disposable test' }), 'Create profile');
  assertNoError(await admin.from('user_cvs').insert({
    user_id: userId, file_name: 'test.pdf', storage_path: documentPath,
  }), 'Create document metadata');
  assertNoError(await admin.storage.from('user-documents').upload(
    documentPath, Buffer.from('%PDF-1.4\n%%EOF'), { contentType: 'application/pdf' },
  ), 'Upload document');
  assertNoError(await admin.storage.from('avatars').upload(
    avatarPath,
    Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg==', 'base64'),
    { contentType: 'image/png' },
  ), 'Upload avatar');

  assertNoError(await client.auth.signInWithPassword({ email, password }), 'Sign in disposable user');
  const result = await client.functions.invoke('delete-account', { body: { confirmation: email } });
  assertNoError(result, 'Invoke deletion function');
  assert.equal(result.data?.success, true);

  const authLookup = await admin.auth.admin.getUserById(userId);
  assert.equal(authLookup.data.user, null, 'Auth user still exists');
  for (const table of ['authorized_users', 'user_profiles', 'user_cvs']) {
    const rows = assertNoError(await admin.from(table).select('id').eq('user_id', userId), `Check ${table}`);
    assert.equal(rows.length, 0, `${table} still has user rows`);
  }
  const pending = assertNoError(await admin.from('authorized_users').select('id').eq('invited_by', userId), 'Check invitations');
  assert.equal(pending.length, 0, 'Pending invitations remain');
  for (const bucket of ['user-documents', 'avatars']) {
    const files = assertNoError(await admin.storage.from(bucket).list(userId), `Check ${bucket}`);
    assert.equal(files.length, 0, `${bucket} still has account files`);
  }
  console.log('Local disposable account deletion passed: Auth, app rows, invitations, and Storage are gone.');
} finally {
  // A failed test must not leave a disposable account behind.
  if (documentPath) await admin.storage.from('user-documents').remove([documentPath]);
  if (avatarPath) await admin.storage.from('avatars').remove([avatarPath]);
  if (userId) {
    await admin.auth.admin.deleteUser(userId);
    await admin.from('authorized_users').delete().eq('user_id', userId);
    await admin.from('authorized_users').delete().eq('invited_by', userId).eq('status', 'pending');
  }
}
