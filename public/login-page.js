import { mountLogin, restoreSession } from './login.js';
import { showRoleHome } from './role-home.js';
import { showLogout, showSessionError, continueAfterLogin } from './session-page.js';

function enterApp() {
  document.querySelector('#login-form').hidden = true;
  if (continueAfterLogin()) return;
  showRoleHome(document);
  showLogout();
}

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
