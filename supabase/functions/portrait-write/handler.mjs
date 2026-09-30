import { inspectImage, MAX_BYTES, MAX_DIMENSION } from './image.mjs';

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

// Bound the multipart request (also when Content-Length is absent or false).
async function readForm(request) {
  const limit = MAX_BYTES + 64 * 1024;
  if (Number(request.headers.get('content-length')) > limit) throw new RangeError();
  const reader = request.body?.getReader();
  if (!reader) throw new Error('Missing body');
  const chunks = []; let length = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      length += value.length;
      if (length > limit) { await reader.cancel(); throw new RangeError(); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Response(new Blob(chunks), { headers: { 'content-type': request.headers.get('content-type') || '' } }).formData();
}

// Narrow injection point for local tests; this handler only serves portraits.
export async function handlePortraitWrite(request, createDb, log = console) {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
  if (request.method !== 'POST') return fail('Method not allowed', 405);
  const token = request.headers.get('x-session-token');
  if (!token || !/^[0-9a-f]{64}$/.test(token)) return fail('Unauthorized', 403);
  if (!request.headers.get('content-type')?.startsWith('multipart/form-data;')) return fail('Expected multipart form', 415);
  let form;
  try { form = await readForm(request); }
  catch (error) { return fail(error instanceof RangeError ? 'Maximum request size exceeded' : 'Invalid form', error instanceof RangeError ? 413 : 400); }
  const action = form.get('action'), type = form.get('entity_type'), id = form.get('entity_id');
  if (!['upload', 'remove'].includes(action) || !['character', 'npc'].includes(type) || typeof id !== 'string' || !UUID.test(id)) return fail('Invalid portrait request', 400);
  for (const field of ['action', 'entity_type', 'entity_id', 'file']) {
    if (form.getAll(field).length > 1) return fail('Duplicate field', 400);
  }
  if (action === 'remove' && form.has('file')) return fail('Remove cannot include a file', 400);
  const entityId = id.toLowerCase();
  const prefix = `${type === 'character' ? 'characters' : 'npcs'}/${entityId}/`;
  const validPath = path => path === null || (typeof path === 'string' && path.startsWith(prefix)
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$/.test(path.slice(prefix.length)));
  const args = { p_session_token: token, p_entity_type: type, p_entity_id: entityId };
  let db, reference;
  try {
    db = await createDb();
    reference = await db.rpc('portrait_reference', { ...args, p_for_write: true });
  } catch { return fail('Portrait authorization unavailable', 503); }
  if (reference.error) return fail(reference.error.code === '42501' ? 'Unauthorized' : 'Portrait authorization unavailable', reference.error.code === '42501' ? 403 : 503);
  if (!Array.isArray(reference.data) || reference.data.length !== 1 || !validPath(reference.data[0].object_path)) return fail('Invalid portrait reference', 502);
  const oldPath = reference.data[0].object_path;
  const storage = db.storage.from('portraits');
  const cleanup = async path => {
    if (!path) return true;
    try {
      const { error } = await storage.remove([path]);
      if (!error) return true;
    } catch { /* Best effort: never roll back a committed reference. */ }
    log.error('portrait-write cleanup failed', { object_path: path });
    return false;
  };
  let newPath = null;
  if (action === 'upload') {
    const file = form.get('file');
    if (!(file instanceof File) || file.size === 0) return fail('Image required', 400);
    if (file.size > MAX_BYTES) return fail('Maximum file size is 5 MiB', 413);
    let bytes, info;
    try { bytes = new Uint8Array(await file.arrayBuffer()); info = inspectImage(bytes); }
    catch { return fail('Invalid JPEG, PNG or WebP image', 415); }
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (file.type !== info.mime || !(info.ext === 'jpg' ? ['jpg', 'jpeg'] : [info.ext]).includes(extension)) return fail('Image content does not match MIME or extension', 415);
    if (info.width < 1 || info.height < 1) return fail('Invalid image dimensions', 415);
    if (info.width > MAX_DIMENSION || info.height > MAX_DIMENSION) return fail('Maximum dimensions are 2048 × 2048 px', 413);
    newPath = `${prefix}${crypto.randomUUID()}.${info.ext}`;
    try {
      const { error } = await storage.upload(newPath, bytes, { contentType: info.mime, upsert: false });
      if (error) {
        // Storage may also wrap a lost response as an error. Keep a cleanup breadcrumb;
        // don't delete on an upload collision/error when ownership of the object is uncertain.
        log.error('portrait-write upload failed', { object_path: newPath });
        return fail('Image upload failed', 502);
      }
    } catch {
      log.error('portrait-write upload outcome unknown', { object_path: newPath });
      return fail('Image upload outcome unknown', 503);
    }
  }
  let change;
  try {
    change = await db.rpc('portrait_change_reference', { ...args, p_expected_path: oldPath, p_new_path: newPath });
  } catch { /* A network error does not prove that the transaction rolled back. */ }
  if (change?.error && ['40001', '42501', '23514', '22023', '22P02', '23503', '23505'].includes(change.error.code)) {
    const cleaned = await cleanup(newPath);
    return json({ error: change.error.code === '40001' ? 'Portrait reference changed' : 'Portrait change rejected',
      cleanup_pending: !cleaned }, change.error.code === '40001' ? 409 : change.error.code === '42501' ? 403 : 422);
  }
  if (change?.error || !Array.isArray(change?.data) || change.data.length !== 1
    || change.data[0].old_path !== oldPath || change.data[0].new_path !== newPath) {
    // Never delete a possibly committed image on timeout, proxy error or malformed reply.
    log.error('portrait-write DB outcome unknown', { entity_type: type, entity_id: entityId, old_path: oldPath, new_path: newPath });
    return json({ error: 'Portrait change outcome unknown; reload reference before retrying', outcome_unknown: true }, 503);
  }
  const cleaned = oldPath !== newPath ? await cleanup(oldPath) : true;
  return json({ object_path: newPath, cleanup_pending: !cleaned });
}
