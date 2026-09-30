import { mountLogin, restoreSession, getCurrentUser } from './login.js';
import { showRoleHome } from './role-home.js';
import { openGame } from './leader-game.js';
import { showLogout, showSessionError, continueAfterLogin } from './session-page.js';
import { showAdminView } from './admin-view.js';

function syncAdminView() {
  const user = getCurrentUser();
  if (user?.role !== 'leader') return;
  const view = new URL(window.location.href).searchParams.get('view');
  if (view === 'game') {
    showAdminView(document, 'home');
    openGame();
  } else if (view === 'players') {
    showAdminView(document, 'players');
    document.querySelector('#leader-players-link').click();
  } else if (view === 'maps') {
    showAdminView(document, 'maps');
    document.querySelector('#leader-maps-link').click();
  } else if (view !== 'game') {
    showAdminView(document, 'home');
    const panel = document.querySelector('#leader-players');
    const maps = document.querySelector('#leader-maps');
    if (!panel.hidden) document.querySelector('#players-back').click();
    else if (!maps.hidden) document.querySelector('#maps-back').click();
  }
}

function enterApp() {
  document.querySelector('#login-form').hidden = true;
  if (continueAfterLogin()) return;
  showRoleHome(document);
  if (new URL(window.location.href).searchParams.get('view') === 'game') openGame();
  else syncAdminView();
  showLogout();
}

window.addEventListener('popstate', () => {
  if (document.querySelector('#login-form').hidden) syncAdminView();
});

mountLogin({
  document,
  async authenticate(username, password) {
    const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
    const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/login`, {
      method: 'POST',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_username: username, p_password: password }),
      cache: 'no-store',
      credentials: 'omit',
    });
    if (!response.ok) throw new Error('Login unavailable');
    return response.json();
  },
  onSuccess() {
    enterApp();
  },
});

try {
  if (await restoreSession()) enterApp();
  else document.querySelector('#login-form').hidden = false;
} catch { showSessionError(); }
