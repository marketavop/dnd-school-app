import { getCurrentUser } from './login.js';
let supabaseUrl = '';
import { handleSessionFailure } from './login.js';
import { configureMapImageUrl, mapImageSrc } from './map-image.js';

async function rpc(name, args = {}) {
  const user = getCurrentUser();
  if (user?.role !== 'leader' || !user.session_token) throw new Error('Access denied');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  supabaseUrl = SUPABASE_URL;
  configureMapImageUrl(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, p_session_token: user.session_token }),
  });
  if (!response.ok) {
    await handleSessionFailure(response);
    throw new Error(`Map operation failed (${response.status})`);
  }
  return response.json();
}
export const loadMaps = () => rpc('leader_maps');
export const mapImageUrl = mapImageSrc;
export async function setMapCellSize(mapId, cellSize) {
  const rows = await rpc('leader_set_map_cell_size', { p_map_id: mapId, p_cell_size: cellSize });
  if (!Array.isArray(rows) || rows.length !== 1 || !Number.isFinite(rows[0].cell_size)
    || rows[0].cell_size < 20 || rows[0].cell_size > 300) throw new Error('Invalid cell size response');
  return rows[0].cell_size;
}
export async function setActiveMap(mapId) {
  const rows = await rpc('leader_set_active_map', { p_map_id: mapId });
  if (!Array.isArray(rows) || rows.length !== 1 || rows[0].active_map_id !== mapId) throw new Error('Invalid map response');
  return rows[0];
}
