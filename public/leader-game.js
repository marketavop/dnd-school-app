import { getCurrentUser } from './login.js';
import { loadMaps, setActiveMap } from './leader-map-api.js';
import { mapImageSrc } from './map-image.js';
import { loadGameTokens, mutateGameToken, loadNpcs, loadNpcDefinitions, mutateNpc } from './token-api.js';

const home = document.querySelector('#leader-content');
const panel = document.querySelector('#leader-game');
const frame = document.querySelector('#leader-game-frame');
const main = document.querySelector('main');
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
document.querySelector('#leader-game-link').addEventListener('click', event => {
  event.preventDefault();
  if (getCurrentUser()?.role !== 'leader') return;
  home.hidden = true;
  panel.hidden = false;
  main.classList.add('players-open');
  frame.src = './game.html?mode=leader';
  document.querySelector('#leader-game-back').textContent = '← Vedoucí';
});

document.querySelector('#game-link').addEventListener('click', event => {
  event.preventDefault();
  if (getCurrentUser()?.role !== 'player') return;
  document.querySelector('#home-content').hidden = true;
  panel.hidden = false;
  main.classList.add('players-open');
  frame.src = './game.html?mode=player';
  document.querySelector('#leader-game-back').textContent = '← Domů';
});
document.querySelector('#leader-game-back').addEventListener('click', () => {
  frame.removeAttribute('src');
  panel.hidden = true;
  main.classList.remove('players-open');
  if (getCurrentUser()?.role === 'leader') home.hidden = false;
  else document.querySelector('#home-content').hidden = false;
});
