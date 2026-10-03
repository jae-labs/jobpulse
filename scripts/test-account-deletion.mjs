// Real Auth/Storage/Function requests; only random synthetic users on a local stack.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

const workdir = process.env.JOBPULSE_TEST_WORKDIR;
const args = [...(workdir ? ['--workdir', workdir] : []), 'status', '-o', 'json'];
const result = spawnSync('supabase', args, { encoding: 'utf8' });
if (result.status !== 0) throw new Error('Local Supabase status unavailable');
const status = JSON.parse(result.stdout);
const url = new URL(status.API_URL);
if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error('Hosted targets forbidden');
const options = { auth: { persistSession: false, autoRefreshToken: false } };
let ready = false;
for (let attempt = 0; attempt < 50; attempt++) {
  try {
    const probe = await fetch(`${url.origin}/functions/v1/delete-account`, { method: 'OPTIONS', signal: AbortSignal.timeout(2000) });
    if (probe.status === 204) { ready = true; break; }
  } catch { /* The local function runtime may still be starting. */ }
  await new Promise(resolve => setTimeout(resolve, 200));
}
if (!ready) throw new Error('Serve delete-account on the local stack before running this test');
const admin = createClient(url.origin, status.SERVICE_ROLE_KEY, options);
const accounts = [];
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const check = result => { if (result.error) throw new Error('Synthetic integration request failed'); return result.data; };

try {
  for (let index = 0; index < 2; index++) {
    const email = `deletion-${randomUUID()}@example.invalid`;
    const password = randomUUID() + 'aA9!';
    const { user } = check(await admin.auth.admin.createUser({ email, password, email_confirm: true }));
    assert(user);
    const client = createClient(url.origin, status.ANON_KEY, options);
    const account = { id: user.id, email, client };
    accounts.push(account);
    check(await admin.from('authorized_users').insert({ email, user_id: user.id, role: 'member', status: 'accepted' }));
    check(await client.auth.signInWithPassword({ email, password }));
    check(await client.storage.from('avatars').upload(`${user.id}/avatar`, png, { contentType: 'image/png' }));
    const path = `${user.id}/cv/synthetic.pdf`;
    check(await client.from('user_cvs').insert({ user_id: user.id, file_name: 'synthetic.pdf', storage_path: path, mime_type: 'application/pdf', file_size: 14 }));
    check(await client.storage.from('user-documents').upload(path, Buffer.from('%PDF-1.4\n%%EOF'), { contentType: 'application/pdf' }));
  }
  const [a, b] = accounts;
  const foreign = await a.client.storage.from('user-documents').download(`${b.id}/cv/synthetic.pdf`);
  assert(foreign.error, 'Foreign document must be denied');
  const wrong = await a.client.functions.invoke('delete-account', { body: { confirmation: b.email, user_id: b.id } });
  assert(wrong.error, 'Foreign email confirmation must be denied');
  assert(check(await admin.auth.admin.getUserById(a.id)).user);
  // Race an owner upload with deletion. Any interrupted cleanup must be retryable.
  const uploads = Array.from({ length: 4 }, () => a.client.storage.from('avatars').upload(`${a.id}/avatar`, png, { contentType: 'image/png', upsert: true }));
  let deletion = await a.client.functions.invoke('delete-account', { body: { confirmation: a.email, user_id: b.id } });
  await Promise.all(uploads);
  if (deletion.error) deletion = await a.client.functions.invoke('delete-account', { body: { confirmation: a.email, user_id: b.id } });
  check(deletion);
  assert((await admin.auth.admin.getUserById(a.id)).error, 'Own Auth identity must be deleted');
  assert(check(await admin.auth.admin.getUserById(b.id)).user, 'Foreign Auth identity must survive forged request UUID');
  for (const bucket of ['avatars', 'user-documents']) {
    assert.deepEqual(check(await admin.storage.from(bucket).list(a.id)), [], 'Own Storage bytes must be removed');
  }
  assert(check(await b.client.storage.from('avatars').download(`${b.id}/avatar`)), 'Foreign bytes must survive');
  assert((await a.client.rpc('is_authorized_user')).data !== true, 'Deleted session must lose database access');
  assert((await a.client.functions.invoke('delete-account', { body: { confirmation: a.email } })).error, 'Deleted session must fail Auth verification');
  console.log('PASS real local two-account Auth/Storage/deletion isolation');
} finally {
  // Only IDs created by this invocation are eligible for cleanup.
  for (const account of accounts) {
    await admin.storage.from('avatars').remove([`${account.id}/avatar`]);
    await admin.storage.from('user-documents').remove([`${account.id}/cv/synthetic.pdf`]);
    await admin.auth.admin.deleteUser(account.id);
    await admin.from('authorized_users').delete().eq('user_id', account.id);
  }
}
