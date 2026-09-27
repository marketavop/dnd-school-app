import { requireSession } from './session-page.js';

if (await requireSession()) await import('./character.js');
