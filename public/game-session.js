import { getCurrentUser } from './login.js';
import { loadMaps, setActiveMap } from './leader-map-api.js';
import { loadGameTokens, mutateGameToken } from './token-api.js';

// The existing map uses these same functions on its parent. For a standalone
// game, parent === window; expose them only after the page guard has succeeded.
export function installGameSession() {
  window.getGameIdentity = () => {
    const user = getCurrentUser();
    if (!user) throw new Error('Access denied');
    return { role: user.role, character_id: user.character_id };
  };
  window.loadLeaderMaps = loadMaps;
  window.setLeaderActiveMap = setActiveMap;
  window.loadGameTokens = loadGameTokens;
  window.mutateGameToken = mutateGameToken;
}
