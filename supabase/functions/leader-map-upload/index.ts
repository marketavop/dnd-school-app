const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DIMENSION = 6144;
const ALLOWED = new Set(['image/png', 'image/jpeg', 'image/webp']);
const CORS_HEADERS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'authorization, x-client-info, apikey, content-type, x-session-token',
};

function dimensions(bytes: Uint8Array, type: string): [number, number] | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (type === 'image/png' && bytes.length >= 24 && view.getUint32(0) === 0x89504e47) {
    return [view.getUint32(16), view.getUint32(20)];
  }
  if (type === 'image/webp' && bytes.length >= 30 && new TextDecoder().decode(bytes.slice(0, 4)) === 'RIFF') {
    const chunk = new TextDecoder().decode(bytes.slice(12, 16));
    if (chunk === 'WEBP') {
      const kind = new TextDecoder().decode(bytes.slice(16, 20));
      if (kind === 'VP8X') return [1 + bytes[24] + (bytes[25] << 8) + (bytes[26] << 16), 1 + bytes[27] + (bytes[28] << 8) + (bytes[29] << 16)];
    }
  }
  if (type === 'image/jpeg' && view.getUint16(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) { offset++; continue; }
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      if ((marker >= 0xc0 && marker <= 0xc3) || (marker >= 0xc5 && marker <= 0xc7)
        || (marker >= 0xc9 && marker <= 0xcb) || (marker >= 0xcd && marker <= 0xcf)) {
        return [view.getUint16(offset + 7), view.getUint16(offset + 5)];
      }
      if (length < 2) break;
      offset += 2 + length;
    }
  }
  return null;
}

function response(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), { status, headers: { ...CORS_HEADERS, 'content-type': 'application/json' } });
}

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS_HEADERS });
  if (request.method !== 'POST') return response('Method not allowed', 405);
  const token = request.headers.get('x-session-token');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!token || !supabaseUrl || !serviceKey) return response('Upload unavailable', 503);
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
  const db = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
  const { data: sessions, error: sessionError } = await db.rpc('validate_session', { p_session_token: token });
  if (sessionError || !Array.isArray(sessions) || sessions.length !== 1 || sessions[0].role !== 'leader') return response('Unauthorized', 403);
  let form: FormData;
  try { form = await request.formData(); } catch { return response('Invalid form', 400); }
  const name = String(form.get('name') ?? '').trim();
  const file = form.get('file');
  if (!name) return response('Název mapy je povinný.', 400);
  if (!(file instanceof File)) return response('Obrázek mapy je povinný.', 400);
  if (!ALLOWED.has(file.type)) return response('Povolené formáty jsou PNG, JPEG a WebP.', 415);
  if (file.size > MAX_BYTES) return response('Maximální velikost souboru je 50 MB.', 413);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const size = dimensions(bytes, file.type);
  if (!size || size[0] < 1 || size[1] < 1) return response('Obrázek se nepodařilo přečíst.', 400);
  if (size[0] > MAX_DIMENSION || size[1] > MAX_DIMENSION) return response('Maximum je 6144 × 6144 px.', 413);
  const mapId = `${crypto.randomUUID()}`;
  const extension = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  const objectPath = `${mapId}.${extension}`;
  const imagePath = `maps/${objectPath}`;
  const { error: uploadError } = await db.storage.from('maps').upload(objectPath, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return response('Obrázek se nepodařilo uložit.', 502);
  const { data: rows, error: rowError } = await db.rpc('leader_create_uploaded_map', { p_session_token: token, p_map_id: mapId, p_name: name, p_image_path: imagePath });
  if (rowError || !Array.isArray(rows) || rows.length !== 1) {
    await db.storage.from('maps').remove([objectPath]);
    return response('Mapu se nepodařilo vytvořit.', 502);
  }
  return new Response(JSON.stringify(rows[0]), { status: 201, headers: { ...CORS_HEADERS, 'content-type': 'application/json' } });
});
