import { getCurrentUser, handleSessionFailure } from './login.js';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.local.js';

async function request(endpoint, body, multipart = false) {
  const token = getCurrentUser()?.session_token;
  if (!token) throw Object.assign(new Error('Přihlášení není dostupné.'), { status: 403 });
  let response, data;
  try {
    response = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'x-session-token': token,
        ...(!multipart ? { 'Content-Type': 'application/json' } : {}) },
      body: multipart ? body : JSON.stringify(body),
    });
    data = await response.json();
  } catch {
    throw Object.assign(new Error('Služba portrétů není dostupná.'), { outcome_unknown: multipart });
  }
  if (!response.ok) {
    await handleSessionFailure(response);
    throw Object.assign(new Error('Operace s portrétem se nezdařila.'), {
      status: response.status, outcome_unknown: data?.outcome_unknown === true,
    });
  }
  return data;
}

export async function portraitImageUrl(id, { entityType = 'character', mapId } = {}) {
  const data = await request('portrait-image-url', { entity_type: entityType, entity_id: id,
    ...(mapId !== undefined ? { map_id: mapId } : {}) });
  if (data?.signed_url === null) return null;
  if (typeof data?.signed_url !== 'string' || !data.signed_url.startsWith('https://')) {
    throw new Error('Portrét není dostupný.');
  }
  return data.signed_url;
}

async function write(id, action, file, { entityType = 'character' } = {}) {
  const form = new FormData();
  form.set('action', action);
  form.set('entity_type', entityType);
  form.set('entity_id', id);
  if (file) form.set('file', file);
  const data = await request('portrait-write', form, true);
  if (!data || !(data.object_path === null || typeof data.object_path === 'string')) {
    throw Object.assign(new Error('Výsledek změny není známý.'), { outcome_unknown: true });
  }
  return data;
}

export async function uploadPortrait(id, file, options) {
  if (file.size > 5 * 1024 * 1024) {
    throw Object.assign(new Error('Obrázek je příliš velký. Maximum je 5 MiB.'), { code: 'FILE_TOO_LARGE' });
  }
  return write(id, 'upload', file, options);
}
export function removePortrait(id, options) { return write(id, 'remove', undefined, options); }
