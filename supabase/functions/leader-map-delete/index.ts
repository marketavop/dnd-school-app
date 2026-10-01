import { handleMapDelete } from './handler.mjs';

Deno.serve(request => handleMapDelete(request, async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('Map delete unavailable');
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
  return createClient(url, key, { auth: { persistSession: false } });
}));
