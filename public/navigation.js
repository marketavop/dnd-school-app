const ids = new URLSearchParams(window.location.search).getAll('character_id');
const valid = ids.length === 1 && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ids[0]);
const query = valid ? `?character_id=${encodeURIComponent(ids[0])}` : '';
const home = document.querySelector('#home-link');
if (home) home.href = `./index.html${query}`;
for (const [id, path] of [['diary-link', 'character.html'], ['game-link', 'game.html']]) {
  const link = document.querySelector(`#${id}`);
  if (link && valid) {
    link.href = `./${path}${query}`;
    link.removeAttribute('aria-disabled');
  }
}
const message = document.querySelector('#navigation-status');
if (message) {
  message.textContent = valid ? '' : 'Chybí platný odkaz na postavu. Otevřete stránku s jedním platným character_id ve formátu UUID.';
}
const game = document.querySelector('#game-content');
let sessionGame = false;
if (game) {
  const { requireSession } = await import('./session-page.js');
  const user = await requireSession();
  if (user && window.parent === window) {
    const { installGameSession } = await import('./game-session.js');
    installGameSession();
  }
  try {
    const identity = user && window.parent.getGameIdentity();
    sessionGame = ['leader', 'player'].includes(identity.role);
    if (home && window.parent !== window) home.hidden = true;
    message.textContent = '';
  } catch { sessionGame = false; }
}
if (game && !sessionGame) message.textContent = 'Hru otevřete z homepage po přihlášení.';
if (game && sessionGame) {
  game.hidden = false;
  try { await import('./app.js'); }
  catch (error) {
    console.error('Spuštění hry selhalo:', error);
    message.textContent = 'Hru se nepodařilo spustit. Zkuste stránku obnovit.';
  }
}
