const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const json = (body, status = 200) => new Response(JSON.stringify(body), {
  status, headers: { ...CORS, 'content-type': 'application/json', 'cache-control': 'no-store' },
});
const fail = (error, status) => json({ error }, status);

// The factory only supplies the server-side client; authorization lives in SQL.
export async function handlePortraitImageUrl(request, createDb) {
  if (request.method === 'OPTIONS') return new Response(null, {
    status: 204, headers: { ...CORS, 'cache-control': 'no-store' },
  });
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  const token = request.headers.get('x-session-token');
  if (!token || token.length !== 64 || !/^[0-9a-f]{64}$/.test(token)) return fail('Unauthorized', 403);
  let body;
  try { body = await request.json(); }
  catch { return fail('Invalid portrait request', 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)
    || !['character', 'npc'].includes(body.entity_type)
    || typeof body.entity_id !== 'string' || body.entity_id.length !== 36 || !UUID.test(body.entity_id)
    || (body.map_id != null && (typeof body.map_id !== 'string' || !body.map_id.trim()))) {
    return fail('Invalid portrait request', 400);
  }
  try {
    const db = await createDb();
    if (!db) return fail('Portrait service unavailable', 503);
    // Never spread client input into RPC arguments or derive permissions here.
    const reference = await db.rpc('portrait_reference', {
      p_session_token: token,
      p_entity_type: body.entity_type,
      p_entity_id: body.entity_id.toLowerCase(),
      p_for_write: false,
      p_map_id: body.map_id ?? null,
    });
    if (reference?.error) {
      if (reference.error.code === '42501') return fail('Unauthorized', 403);
      if (reference.error.code === '22023') return fail('Invalid portrait request', 400);
      return fail('Portrait image unavailable', 502);
    }
    if (!Array.isArray(reference?.data) || reference.data.length !== 1) return fail('Portrait image unavailable', 502);
    const objectPath = reference.data[0]?.object_path;
    if (objectPath === null) return json({ signed_url: null });
    if (typeof objectPath !== 'string' || !objectPath.trim()) return fail('Portrait image unavailable', 502);
    const signed = await db.storage.from('portraits').createSignedUrl(objectPath, 3600);
    if (signed?.error || typeof signed?.data?.signedUrl !== 'string' || !signed.data.signedUrl.trim()) {
      return fail('Portrait image unavailable', 502);
    }
    return json({ signed_url: signed.data.signedUrl });
  } catch {
    // Backend errors may contain credentials or URLs: do not echo or log them.
    return fail('Portrait image unavailable', 502);
  }
}
