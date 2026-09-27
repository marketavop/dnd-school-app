import { getCurrentUser } from './login.js';

// This chooses the entry UI only; game-data authorization is a separate ticket.
export function showRoleHome(document) {
  const player = document.querySelector('#home-content');
  const leader = document.querySelector('#leader-content');
  const error = document.querySelector('#role-error');
  player.hidden = true;
  leader.hidden = true;
  error.hidden = true;

  const user = getCurrentUser();
  if (!user || !['player', 'leader'].includes(user.role)) {
    error.textContent = 'Vstup není dostupný. Obnovte stránku a přihlaste se znovu.';
    error.hidden = false;
    return;
  }

  // Prefer the account's character; retain existing URL navigation when absent.
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (uuid.test(user.character_id)) {
    const query = `?character_id=${encodeURIComponent(user.character_id)}`;
    for (const [id, path] of [['diary-link', 'character.html'], ['game-link', 'game.html']]) {
      const link = document.querySelector(`#${id}`);
      link.href = `./${path}${query}`;
      link.removeAttribute('aria-disabled');
    }
    document.querySelector('#navigation-status').textContent = '';
  }

  if (user.role === 'player') {
    document.querySelector('#signed-in-status').textContent = `Přihlášený uživatel: ${user.user_id} · Role: ${user.role}`;
    player.hidden = false;
    return;
  }

  const game = document.querySelector('#game-link');
  const leaderGame = document.querySelector('#leader-game-link');
  const href = game.getAttribute('href');
  if (href) {
    leaderGame.setAttribute('href', href);
    leaderGame.removeAttribute('aria-disabled');
  } else {
    leaderGame.removeAttribute('href');
    leaderGame.setAttribute('aria-disabled', 'true');
  }
  leaderGame.setAttribute('href', '#leader-game');
  leaderGame.removeAttribute('aria-disabled');
  document.querySelector('#leader-status').textContent = '';
  leader.hidden = false;
}
