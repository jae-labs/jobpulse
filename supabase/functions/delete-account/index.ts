import { createClient } from 'npm:@supabase/supabase-js@2';
import { removeAccountFiles } from './storage.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, apikey, x-client-info, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders });
  }
  if (request.method !== 'POST') return json(405, { error: 'Method not allowed' });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return json(401, { error: 'Authentication required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(503, { error: 'Account deletion is unavailable' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user?.id || !user.email) {
    return json(401, { error: 'Authentication required' });
  }

  let confirmation: unknown;
  try {
    ({ confirmation } = await request.json());
  } catch {
    return json(400, { error: 'Confirm your email address' });
  }
  if (typeof confirmation !== 'string' || confirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
    return json(400, { error: 'Confirm your email address' });
  }

  try {
    const userId = user.id;
    const [cvs, coverLetters] = await Promise.all([
      admin.from('user_cvs').select('storage_path').eq('user_id', userId),
      admin.from('user_cover_letters').select('storage_path').eq('user_id', userId),
    ]);
    if (cvs.error || coverLetters.error) throw new Error('Could not list account documents');

    const documentPaths = [...(cvs.data ?? []), ...(coverLetters.data ?? [])]
      .map((item) => item.storage_path)
      .filter((path): path is string => typeof path === 'string' && path.length > 0);

    await removeAccountFiles(admin.storage.from('user-documents'), userId, documentPaths);
    await removeAccountFiles(admin.storage.from('avatars'), userId);

    // Auth deletion cascades candidate rows. The migration trigger removes the
    // access row and pending invitations in the same database transaction.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) throw deleteError;

    return json(200, { success: true });
  } catch {
    return json(500, { error: 'Account deletion failed. Please try again or contact support.' });
  }
});
