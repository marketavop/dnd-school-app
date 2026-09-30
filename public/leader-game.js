import { getCurrentUser } from './login.js';
import { loadMaps, setActiveMap } from './leader-map-api.js';
import { mapImageSrc } from './map-image.js';
import { loadGameTokens, mutateGameToken, loadNpcs, loadNpcDefinitions, mutateNpc } from './token-api.js';

const home = document.querySelector('#leader-content');
const panel = document.querySelector('#leader-game');
const frame = document.querySelector('#leader-game-frame');
const main = document.querySelector('main');
window.getGameHomeUrl = () => {
  const url = new URL(window.location.href);
  url.searchParams.delete('view');
  return url.href;
};
// Same-origin embedded game uses the homepage's in-memory session, never a URL token.
window.loadLeaderMaps = loadMaps;
window.setLeaderActiveMap = setActiveMap;
window.loadGameTokens = loadGameTokens;
window.loadNpcs = loadNpcs;
window.loadNpcDefinitions = loadNpcDefinitions;
window.mutateNpc = mutateNpc;
window.loadMaps = loadMaps;
window.mapImageUrl = typeof mapImageSrc === 'function' ? mapImageSrc : path => path;
window.mutateGameToken = mutateGameToken;
window.getGameIdentity = () => {
  const user = getCurrentUser();
  if (!user?.session_token) throw new Error('Access denied');
  return { role: user.role, character_id: user.character_id };
};
export function openGame() {
  const user = getCurrentUser();
  if (!user?.session_token || !['player', 'leader'].includes(user.role)) return;
  const url = new URL(window.location.href);
  url.searchParams.set('view', 'game');
  window.history.replaceState(null, '', url.href);
  home.hidden = true;
  document.querySelector('#home-content').hidden = true;
  panel.hidden = false;
  main.classList.add('players-open');
  frame.src = `./game.html?mode=${user.role}`;
}
document.querySelector('#leader-game-link').addEventListener('click', event => {
  event.preventDefault();
  if (getCurrentUser()?.role === 'leader') openGame();
});

document.querySelector('#game-link').addEventListener('click', event => {
  event.preventDefault();
  if (getCurrentUser()?.role === 'player') openGame();
});
