import { getCurrentUser } from './login.js';
let supabaseUrl = '';
let publishableKey = '';

export function configureMapImageUrl(url, key = '') {
  supabaseUrl = url || '';
  publishableKey = key || '';
}

export function mapImageSrc(path) {
  if (!path || !path.startsWith('maps/')) return path;
  return path;
}

export async function resolveMapImage(path, mapId) {
  if (!path || !path.startsWith('maps/')) return path;
  const identity = globalThis.getGameIdentity?.() || globalThis.parent?.getGameIdentity?.();
  const token = identity?.session_token || getCurrentUser()?.session_token || '';
  const response = await fetch(`${supabaseUrl}/functions/v1/map-image-url`, {
    method: 'POST', headers: { apikey: publishableKey, 'content-type': 'application/json', 'x-session-token': token },
    body: JSON.stringify({ map_id: mapId }),
  });
  if (!response.ok) throw new Error(`Map image URL failed (${response.status})`);
  const data = await response.json();
  return data.signed_url;
}
