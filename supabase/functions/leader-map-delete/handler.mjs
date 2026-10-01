const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
});

export async function handleMapDelete(request, createClient) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ code: 'METHOD_NOT_ALLOWED' }, 405);
  const token = request.headers.get('x-session-token');
  if (!token) return json({ code: 'UNAUTHORIZED' }, 403);
  let body;
  try { body = await request.json(); } catch { return json({ code: 'INVALID_REQUEST' }, 400); }
  if (typeof body?.map_id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,62}$/.test(body.map_id)) {
    return json({ code: 'INVALID_MAP' }, 400);
  }
  let db, result;
  try {
    db = await createClient();
    result = await db.rpc('leader_delete_map', { p_session_token: token, p_map_id: body.map_id });
  } catch {
    return json({ code: 'DELETE_UNCONFIRMED' }, 502);
  }
  if (result.error) {
    const errors = { '42501': [403, 'UNAUTHORIZED'], PT409: [409, 'MAP_ACTIVE'], P0002: [404, 'MAP_NOT_FOUND'] };
    const [status, code] = errors[result.error.code] || [500, 'DELETE_FAILED'];
    return json({ code }, status);
  }
  if (!Array.isArray(result.data) || result.data.length !== 1 || typeof result.data[0].image_path !== 'string') {
    return json({ code: 'DELETE_UNCONFIRMED' }, 502);
  }
  const path = result.data[0].image_path;
  // Only the exact upload naming convention is eligible. Never use client paths.
  const uploaded = /^maps\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(?:png|jpg|jpeg|webp))$/.exec(path);
  if (!uploaded) return json({ deleted: true, storage_cleanup: 'skipped' });
  try {
    const { error } = await db.storage.from('maps').remove([uploaded[1]]);
    if (error) throw error;
  } catch {
    // DB deletion already committed. No rollback, retry queue or false success.
    console.error('Map storage cleanup failed', { map_id: body.map_id, object_path: uploaded[1] });
    return json({ deleted: true, storage_cleanup: 'failed', warning: 'STORAGE_CLEANUP_FAILED' });
  }
  return json({ deleted: true, storage_cleanup: 'removed' });
}
