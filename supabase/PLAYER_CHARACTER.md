# Ticket 6A — ownership hráčského deníku

Po session migracích nasaďte `migrations/20260925160000_player_character_ownership.sql`.
Migrace nejprve odebere klientským rolím `anon` a `authenticated` přímý
SELECT/INSERT/UPDATE/DELETE nad `public.characters`. Leader čtení dál používá
svou existující SECURITY DEFINER RPC.

Nové RPC:

- `public.player_character(p_session_token, p_character_id)` vrací celý deník
  pouze po `require_session(token, 'player')` a vazbě
  `app_private.users.id = session.user_id` plus
  `app_private.users.character_id = p_character_id`.
- `public.player_update_character(p_session_token, p_character_id, p_patch)`
  provede pouze jeden povolený update stejné vlastněné postavy a vrátí nový řádek.
  Povolené klíče odpovídají současným autosave polím; `id`, `user_id` a jiné
  klíče jsou odmítnuty. Snížení `max_hp` zachovává původní atomickou korekci
  `current_hp` na nové maximum.

Session, roli i vlastnictví vždy rozhoduje databáze. Vlastnictví je od migrace
`20260925170000_user_characters_ownership.sql` explicitní v tabulce
`app_private.user_characters (user_id, character_id)`. Migrace ji naplní z dosavadních
nenulových `users.character_id` pomocí `ON CONFLICT DO NOTHING`; staré pole zůstává
kvůli kompatibilitě, ale nové autorizace ho nepoužívají. Jeden účet tak může mít
0, 1 nebo více postav. Cizí, neexistující,
neplatný nebo expirovaný token vrací jednotné odmítnutí SQLSTATE `42501` bez
vrácení řádku a bez zápisu. Frontend dál používá stejný deník, validace,
autosave, HP UI a výpočty; `characters.js` pouze přepne hráčskou cestu na RPC.
Leader iframe je beze změny a stále používá `leader_character`.

Testy:

`node tests/player-character.cjs` ověřuje, že tokenová hráčská cesta posílá jen
RPC a žádný přímý table call. `tests/user-characters-migration.sql` ověřuje
vlastní/cizí read, vlastní update, zakázaný field, neexistující postavu a přímé
REST granty v prázdné jednorázové DB. V tomto prostředí není `psql`, takže SQL
test ani skutečný REST request proti živému Supabase nebyl spuštěn.

Po nasazení ověřte A–E z ticketu. Pokud by REST SELECT/UPDATE přes `anon` po
migraci stále prošel, migrace nebyla aplikována nebo existuje další grant/policy;
v takovém případě jde o otevřenou bezpečnostní mezeru a ticket není uzavřen.
