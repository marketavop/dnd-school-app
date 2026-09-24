// Memory only: a new document/module instance always starts signed out.
let currentUser = null;
export function getCurrentUser() { return currentUser; }

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
      const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!user || !uuid.test(user.user_id) || !['player', 'leader'].includes(user.role)
          || !(user.character_id === null || uuid.test(user.character_id))) {
        status.textContent = 'Nesprávné přihlašovací údaje';
        return;
      }
      currentUser = Object.freeze({ user_id: user.user_id, role: user.role, character_id: user.character_id });
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
