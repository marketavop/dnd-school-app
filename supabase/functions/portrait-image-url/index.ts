import { handlePortraitImageUrl } from './handler.mjs';

// Custom x-session-token auth is enforced by portrait_reference. Deploy this
// function with gateway JWT verification disabled, as with portrait-write.
Deno.serve(request => handlePortraitImageUrl(request, async () => {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return null;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.57.4');
  return createClient(url, key, { auth: { persistSession: false } });
}));
