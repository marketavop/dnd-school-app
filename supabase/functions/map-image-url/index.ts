const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};
function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, 'content-type': 'application/json' } });
}
function storageObjectPath(imagePath: string) {
  return imagePath.startsWith('maps/') ? imagePath.slice('maps/'.length) : imagePath;
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  let stage = 'parse-request';
  try {
    const token = request.headers.get('x-session-token');
    const url = Deno.env.get('SUPABASE_URL');
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!token || !url || !key) return json({ error: 'Unavailable' }, 503);
    const body = await request.json();
    const mapId = body?.map_id;
    if (typeof mapId !== 'string' || !mapId) return json({ error: 'Invalid map' }, 400);

    stage = 'create-client';
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
    const db = createClient(url, key, { auth: { persistSession: false } });

    stage = 'validate-session';
    const { data: sessions, error: sessionError } = await db.rpc('validate_session', { p_session_token: token });
    if (sessionError) throw sessionError;
    if (!Array.isArray(sessions) || sessions.length !== 1) return json({ error: 'Unauthorized' }, 403);
    const role = sessions[0].role;
    const { data: state, error: stateError } = await db.from('game_state').select('active_map_id').eq('id', 1).single();
    if (stateError) throw stateError;
    if (role !== 'leader' && state?.active_map_id !== mapId) return json({ error: 'Forbidden' }, 403);

    stage = 'load-map-metadata';
    const result = role === 'leader'
      ? await db.rpc('leader_maps', { p_session_token: token })
      : await db.rpc('active_map_metadata', { p_map_id: mapId });
    if (result.error) throw result.error;
    const map = Array.isArray(result.data) ? result.data.find(item => item.map_id === mapId) : null;
    if (!map?.image_path?.startsWith('maps/')) return json({ error: 'Map not found' }, 404);

    stage = 'create-signed-url';
    const objectPath = storageObjectPath(map.image_path);
    const { data: signed, error: signedError } = await db.storage.from('maps').createSignedUrl(objectPath, 3600);
    if (signedError) {
      console.error('map-image-url createSignedUrl failed', { objectPath, error: signedError });
      throw signedError;
    }
    if (!signed?.signedUrl) throw new Error('Signed URL missing');
    return json({ signed_url: signed.signedUrl });
  } catch (error) {
    console.error('map-image-url failed', { stage, error });
    return json({ error: 'Map image URL failed', stage }, 500);
  }
});
