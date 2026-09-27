# Upload připravené mapy

## Co přibylo

Vedoucí má v Mapy tlačítko `+ Přidat mapu`. Formulář vyžaduje název a jeden
PNG, JPEG/JPG nebo WebP soubor. Browser před odesláním kontroluje MIME,
velikost do 50 MB a rozměry do 6144 × 6144 px. Server kontroluje totéž znovu;
klientská validace proto není bezpečnostní hranice.

Upload jde přes jedinou Edge Function
`supabase/functions/leader-map-upload/index.ts`. Nepoužívá veřejný zápis do
Storage. Function očekává vlastní hlavičku `x-session-token`, ověří ji přes
`validate_session` a pokračuje pouze pro roli leader. Používá Supabase
service-role key uložený jako Edge Function secret, nikoli v browseru.

Server podporuje rozměrové hlavičky PNG, JPEG SOF a WebP VP8X. Neprovádí resize,
konverzi, kompresi, ořez ani thumbnail. Soubor dostane náhodný UUID název
v bucketu `maps`; původní filename není identita mapy. Bucket je veřejný jen
pro čtení, upload zajišťuje service role Edge Function.

Po úspěšném uploadu Function volá leader-only RPC
`leader_create_uploaded_map`. Ta vloží metadata do existující
`app_private.maps` a `map_config` s `cell_size = 100`. Mapa se neaktivuje.
Při chybě databázového zápisu Function zkusí soubor odstranit. Při chybě
Storage záznam nevzniká. Neexistuje druhá tabulka map ani lifecycle stav.

Migrace k ručnímu nasazení:

1. `20260924170000_map_upload.sql` vytvoří/konfiguruje bucket `maps` a RPC.
2. `20260924170001_active_map_metadata.sql` umožní leader hernímu pohledu
   načíst metadata nově připravené aktivní mapy (stávající statické mapy
   zůstávají beze změny).
3. Deployujte Function z kořene projektu podle svého Supabase projektu,
   například `supabase functions deploy leader-map-upload`.
4. Nastavte Function secret `SUPABASE_SERVICE_ROLE_KEY`. `SUPABASE_URL`
   runtime poskytuje Supabase; service-role key nikdy nepatří do `public/`.

Novou mapu lze po uploadu otevřít přes stávající `Připravit`; načte se bucket
URL a výchozí grid 100. Aktivace je stále oddělená činnost a upload ji
neprovádí.

## Ověření

`node tests/map-upload.cjs` ověřuje leader guard a předběžnou validaci formuláře.
Existující testy Mapy, přípravy, aktivní mapy, tokenů, session a loginu zůstaly
průchozí. V tomto prostředí nebyl dostupný psql, Supabase CLI ani nasazená
Edge Function, proto serverový upload, Storage a cleanup orphan souboru musí
proběhnout po nasazení.

Po nasazení ověřte: player/invalid/expired token 403; GIF/SVG, >50 MB a obě
rozměrové osy nad 6144 odmítnuté před uložením; 6144×6144 povolené; PNG/JPEG/
WebP vytvoří jednu mapu s cell_size 100, není aktivní a objeví se v Mapy.
Selhání Storage nebo DB nesmí ponechat DB mapu, respektive se má pokusit
odstranit nový Storage objekt.
