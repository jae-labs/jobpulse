import { createClient } from 'npm:@supabase/supabase-js@2.116.0';
import { removeAccountFiles } from './storage.ts';
import { corsHeadersFor, isOriginAllowed } from './cors.ts';

function json(request: Request, status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeadersFor(request.headers.get('Origin'), Deno.env.get('ALLOWED_ORIGINS')),
      'Content-Type': 'application/json',
    },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('Origin');
  const configuredOrigins = Deno.env.get('ALLOWED_ORIGINS');

  if (request.method === 'OPTIONS') {
    const status = isOriginAllowed(origin, configuredOrigins) ? 204 : 403;
    return new Response(null, { status, headers: corsHeadersFor(origin, configuredOrigins) });
  }
  if (request.method !== 'POST') return json(request, 405, { error: 'Method not allowed' });
  if (!isOriginAllowed(origin, configuredOrigins)) return json(request, 403, { error: 'Origin not allowed' });

  const token = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token) return json(request, 401, { error: 'Authentication required' });

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return json(request, 503, { error: 'Account deletion is unavailable' });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user?.id || !user.email) {
    return json(request, 401, { error: 'Authentication required' });
  }

  let confirmation: unknown;
  try {
    ({ confirmation } = await request.json());
  } catch {
    return json(request, 400, { error: 'Confirm your email address' });
  }
  if (typeof confirmation !== 'string' || confirmation.trim().toLowerCase() !== user.email.toLowerCase()) {
    return json(request, 400, { error: 'Confirm your email address' });
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

    // The Auth deletion trigger removes access and pending invitations.
    const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
    if (deleteError) throw deleteError;

    return json(request, 200, { success: true });
  } catch {
    return json(request, 500, { error: 'Account deletion failed. Please try again or contact support.' });
  }
});
