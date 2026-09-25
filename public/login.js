// Cached identity is never trusted until validate_session succeeds on page load.
const SESSION_KEY = 'dnd-school.session.v1';
let currentUser = null;
let restoring = null;
let revision = 0;
export function getCurrentUser() { return currentUser; }

function storage() {
  try { return globalThis.sessionStorage; } catch { return null; }
}

export function clearSession() {
  revision++;
  currentUser = null;
  restoring = null;
  try { storage()?.removeItem(SESSION_KEY); } catch { /* Storage may be disabled. */ }
}

function rememberSession(user) {
  currentUser = Object.freeze({ user_id: user.user_id, role: user.role,
    character_id: user.character_id, session_token: user.session_token });
  revision++;
  try { storage()?.setItem(SESSION_KEY, JSON.stringify(currentUser)); } catch { /* Memory login still works. */ }
}

function validSession(user) {
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return user && uuid.test(user.user_id) && ['player', 'leader'].includes(user.role)
    && (user.character_id === null || uuid.test(user.character_id))
    && typeof user.session_token === 'string' && /^[0-9a-f]{64}$/.test(user.session_token);
}

async function validateToken(token) {
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  const response = await fetch(`${SUPABASE_URL}/rest/v1/rpc/validate_session`, {
    method: 'POST', credentials: 'omit', cache: 'no-store',
    headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ p_session_token: token }),
  });
  const data = await response.json();
  if (!response.ok) {
    if ((response.status === 401 || response.status === 403) && data?.code === '42501') return null;
    throw new Error('Session verification unavailable');
  }
  if (Array.isArray(data) && data.length === 0) return null;
  if (!Array.isArray(data) || data.length !== 1 || !data[0]?.user_id
      || !['player', 'leader'].includes(data[0].role)) throw new Error('Invalid verification response');
  return data[0];
}

export async function restoreSession({ force = false } = {}) {
  if (restoring) return restoring;
  if (currentUser && !force) return currentUser;
  let saved = currentUser;
  if (!saved) {
    try { saved = JSON.parse(storage()?.getItem(SESSION_KEY) ?? 'null'); }
    catch { clearSession(); return null; }
  }
  if (!validSession(saved)) { clearSession(); return null; }
  const started = revision;
  const attempt = (async () => {
    const identity = await validateToken(saved.session_token);
    if (started !== revision) return currentUser; // A pending response cannot undo logout/new login.
    if (!identity || identity.user_id !== saved.user_id) { clearSession(); return null; }
    rememberSession({ ...saved, role: identity.role });
    return currentUser;
  })();
  restoring = attempt;
  try { return await attempt; }
  finally { if (restoring === attempt) restoring = null; }
}

export function logout() {
  clearSession();
  window.top.location.replace(new URL('./index.html', window.location.href).href);
}

// A permission error may be about the operation, not the token. Verify first.
export async function handleSessionFailure(response) {
  if (response.status !== 401 && response.status !== 403) return;
  try { if (!await restoreSession({ force: true })) logout(); }
  catch { /* Do not delete a session on a network/server error. */ }
}

export function mountLogin({ document, authenticate, onSuccess }) {
  const form = document.querySelector('#login-form');
  const username = document.querySelector('#username');
  const password = document.querySelector('#password');
  const submit = document.querySelector('#login-submit');
  const status = document.querySelector('#login-status');
  let pending = false;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (pending || currentUser) return;
    pending = true;
    submit.disabled = true;
    status.textContent = 'Přihlašuji…';
    try {
      const result = await authenticate(username.value, password.value);
      const user = Array.isArray(result) && result.length === 1 ? result[0] : null;
      if (!validSession(user)) {
        status.textContent = 'Nesprávné přihlašovací údaje';
        return;
      }
      rememberSession(user);
      status.textContent = '';
      form.hidden = true;
      onSuccess(currentUser);
    } catch {
      status.textContent = 'Přihlášení se nepodařilo. Zkuste to znovu.';
    } finally {
      password.value = '';
      pending = false;
      submit.disabled = false;
    }
  });
}
