import { getCurrentUser } from './login.js';

const button = document.querySelector('#add-map-button');
const form = document.querySelector('#map-upload-form');
const name = document.querySelector('#map-upload-name');
const fileInput = document.querySelector('#map-upload-file');
const error = document.querySelector('#map-upload-error');
const status = document.querySelector('#maps-status');
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_DIMENSION = 6144;
const MIME = new Set(['image/png', 'image/jpeg', 'image/webp']);

button.addEventListener('click', () => { form.hidden = false; button.hidden = true; error.textContent = ''; });
document.querySelector('#map-upload-cancel').addEventListener('click', () => { form.reset(); form.hidden = true; button.hidden = false; error.textContent = ''; });
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (getCurrentUser()?.role !== 'leader') return;
  const file = fileInput.files?.[0];
  const title = name.value.trim();
  if (!title) { error.textContent = 'Název mapy je povinný.'; return; }
  if (!file) { error.textContent = 'Obrázek mapy je povinný.'; return; }
  if (!MIME.has(file.type)) { error.textContent = 'Povolené formáty jsou PNG, JPEG a WebP.'; return; }
  if (file.size > MAX_BYTES) { error.textContent = 'Maximální velikost souboru je 50 MB.'; return; }
  try { const bitmap = await createImageBitmap(file); const ok = bitmap.width <= MAX_DIMENSION && bitmap.height <= MAX_DIMENSION; bitmap.close(); if (!ok) { error.textContent = 'Maximum je 6144 × 6144 px.'; return; } }
  catch { error.textContent = 'Obrázek se nepodařilo přečíst.'; return; }
  const user = getCurrentUser();
  const { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } = await import('./config.local.js');
  const data = new FormData(); data.set('name', title); data.set('file', file);
  button.disabled = true; form.querySelector('button[type="submit"]').disabled = true; error.textContent = ''; status.textContent = 'Nahrávám mapu…';
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/leader-map-upload`, { method: 'POST', headers: { apikey: SUPABASE_PUBLISHABLE_KEY, 'x-session-token': user.session_token }, body: data });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.error || 'Upload failed');
    form.reset(); form.hidden = true; button.hidden = false; status.textContent = 'Mapa byla přidána.'; document.querySelector('#leader-maps-link').click();
  } catch (cause) { console.error('Upload mapy selhal:', cause); error.textContent = cause.message || 'Mapu se nepodařilo přidat. Zkuste to znovu.'; }
  finally { button.disabled = false; form.querySelector('button[type="submit"]').disabled = false; }
});
