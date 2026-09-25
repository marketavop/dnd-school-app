import { getCurrentUser } from './login.js';
import { handleSessionFailure } from './login.js';

async function rpc(name, args) {
  const user = getCurrentUser();
  if (!user?.session_token || !['player', 'leader'].includes(user.role)) throw new Error('Access denied');
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...args, p_session_token: user.session_token }),
  });
  if (!response.ok) {
    await handleSessionFailure(response);
    throw new Error(`Token operation failed (${response.status})`);
  }
  return response.json();
}

export function loadGameTokens(mapId) {
  return rpc(getCurrentUser()?.role === 'leader' ? 'leader_player_tokens' : 'player_token', { p_map_id: mapId });
}

export function loadNpcs(mapId) {
  return rpc('map_npcs', { p_map_id: mapId });
}
export function loadNpcDefinitions() {
  return rpc('leader_npcs', {});
}
export function mutateNpc(action, args) {
  if (getCurrentUser()?.role !== 'leader') throw new Error('Access denied');
  const operation = { create: 'leader_create_npc', delete: 'leader_delete_npc',
    add: 'leader_add_npc_to_map', move: 'leader_set_npc_position',
    visibility: 'leader_set_npc_visibility', remove: 'leader_remove_npc_from_map' }[action];
  if (!operation) throw new Error('Invalid NPC action');
  return rpc(operation, args);
}

export async function mutateGameToken(action, characterId, mapId, point) {
  const operation = { add: 'add_token', move: 'set_token_position', remove: 'remove_token' }[action];
  if (!operation) throw new Error('Invalid token action');
  const args = { p_character_id: characterId, p_map_id: mapId };
  if (action !== 'remove') Object.assign(args, { p_x: point.x, p_y: point.y });
  const rows = await rpc(operation, args);
  if (action === 'remove') return null;
  if (!Array.isArray(rows) || rows.length !== 1 || !Number.isFinite(rows[0].x) || !Number.isFinite(rows[0].y)) {
    throw new Error('Invalid token position');
  }
  return rows[0];
}
