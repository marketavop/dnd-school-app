import { restoreSession, logout } from './login.js';

// Back/forward cache must not revive a protected document after logout.
window.addEventListener('pageshow', event => {
  if (event.persisted) window.location.reload();
});

export function showLogout() {
  if (document.querySelector('#session-logout') || window.parent !== window) return;
  const button = document.createElement('button');
  button.id = 'session-logout';
  button.type = 'button';
  button.textContent = 'Odhlásit';
  button.addEventListener('click', logout);
  document.body.prepend(button);
}

export function showSessionError() {
  const status = document.createElement('p');
  status.setAttribute('role', 'alert');
  status.textContent = 'Přihlášení se nepodařilo ověřit. Zkontrolujte připojení a zkuste to znovu. ';
  const retry = document.createElement('button');
  retry.type = 'button';
  retry.textContent = 'Zkusit znovu';
  retry.addEventListener('click', () => window.location.reload());
  status.append(retry);
  document.body.prepend(status);
}

export async function requireSession() {
  try {
    const user = await restoreSession();
    if (user) { showLogout(); return user; }
    const login = new URL('./index.html', window.location.href);
    const here = new URL(window.location.href);
    login.searchParams.set('next', here.pathname.split('/').pop() + here.search);
    window.top.location.replace(login.href);
  } catch { showSessionError(); }
  return null;
}

export function continueAfterLogin() {
  const next = new URL(window.location.href).searchParams.get('next');
  if (!next) return false;
  const target = new URL(next, window.location.href);
  const base = new URL('./', window.location.href);
  if (target.origin !== base.origin || !['character.html', 'game.html'].some(name => target.pathname === base.pathname + name)) return false;
  window.location.replace(target.href);
  return true;
}
