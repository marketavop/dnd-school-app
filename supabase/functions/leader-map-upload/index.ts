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
  if (type === 'image/webp') {
    // Inspect the RIFF container and image headers, without decoding pixels.
    // https://developers.google.com/speed/webp/docs/riff_container
    const text = (p: number, n: number) => new TextDecoder().decode(bytes.subarray(p, p + n));
    const u24 = (p: number) => bytes[p] + bytes[p + 1] * 256 + bytes[p + 2] * 65536;
    if (bytes.length < 20 || text(0, 4) !== 'RIFF' || text(8, 4) !== 'WEBP'
      || view.getUint32(4, true) !== bytes.length - 8) return null;
    const chunks = (start: number, end: number) => {
      const result = [];
      for (let p = start; p < end;) {
        if (p + 8 > end) return null;
        const length = view.getUint32(p + 4, true);
        const next = p + 8 + length + (length % 2);
        if (next > end || (length % 2 && bytes[next - 1] !== 0)) return null;
        result.push({ kind: text(p, 4), p: p + 8, length });
        p = next;
      }
      return result;
    };
    const bitstream = (kind: string, p: number, length: number): [number, number] | null => {
      if (kind === 'VP8 ') {
        if (length <= 10 || (bytes[p] & 1)
          || bytes[p + 3] !== 0x9d || bytes[p + 4] !== 0x01 || bytes[p + 5] !== 0x2a) return null;
        return [view.getUint16(p + 6, true) & 0x3fff, view.getUint16(p + 8, true) & 0x3fff];
      }
      if (kind === 'VP8L') {
        if (length <= 5 || bytes[p] !== 0x2f || (bytes[p + 4] & 0xe0)) return null;
        const bits = view.getUint32(p + 1, true);
        return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1];
      }
      return null;
    };
    const parts = chunks(12, bytes.length);
    if (!parts?.length) return null;
    let canvas: [number, number] | null = null;
    let animated = false, animationHeader = false, images = 0;
    for (const part of parts) {
      const { kind, p, length } = part;
      if (kind === 'VP8X') {
        if (part !== parts[0] || length !== 10 || (bytes[p] & 0xc1)
          || bytes[p + 1] || bytes[p + 2] || bytes[p + 3]) return null;
        canvas = [u24(p + 4) + 1, u24(p + 7) + 1];
        animated = Boolean(bytes[p] & 2);
      } else if (kind === 'ANIM') {
        if (!animated || animationHeader || length !== 6) return null;
        animationHeader = true;
      } else if (kind === 'ANMF') {
        if (!animated || !animationHeader || !canvas || length < 16 || (bytes[p + 15] & 0xfc)) return null;
        const width = u24(p + 6) + 1, height = u24(p + 9) + 1;
        if (u24(p) * 2 + width > canvas[0] || u24(p + 3) * 2 + height > canvas[1]) return null;
        const frame = chunks(p + 16, p + length);
        if (!frame) return null;
        const data = frame.filter(item => item.kind === 'VP8 ' || item.kind === 'VP8L');
        if (data.length !== 1) return null;
        const size = bitstream(data[0].kind, data[0].p, data[0].length);
        if (!size || size[0] !== width || size[1] !== height) return null;
        images++;
      } else if (kind === 'VP8 ' || kind === 'VP8L') {
        const size = bitstream(kind, p, length);
        if (!size || !size[0] || !size[1] || animated || images
          || (canvas && (canvas[0] !== size[0] || canvas[1] !== size[1]))) return null;
        canvas = size;
        images++;
      }
    }
    return images ? canvas : null;
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
