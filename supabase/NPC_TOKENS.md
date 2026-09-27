# Globální NPC a umístění na mapách

Nasadit migraci `20260925140000_npc_definitions_placements.sql` po migraci
5A `20260925120000_npc_tokens.sql`, společně s aktualizovaným frontendem.
Staré RPC jsou odstraněné; otevřené staré klienty obnovit.
Žádná Edge Function ani Storage změna není potřeba.

## Model a převod

- `app_private.npcs`: id, name, image_url.
- `app_private.npc_placements`: id, npc_id, map_id, x, y, visible.
- FK npc_id má ON DELETE CASCADE; UNIQUE(npc_id,map_id) brání duplicitě.

Transakce zamkne starou tabulku, zkopíruje každý řádek do vlastní definice
a placementu (ID se zachovají), ověří obsah a přejmenuje zdroj na
`npc_tokens_5a_backup`. Neslučuje stejné názvy ani obrázky. Zachovává i staré
prázdné názvy. Nové definice vyžadují neprázdný název.
Záloha nemá aktivní RPC ani realtime trigger a klienti k ní nemají přístup.
Její případné odstranění je samostatný krok až po živém ověření.

## RPC

- `leader_npcs(p_session_token)` — globální seznam pouze pro leadera.
- `leader_create_npc(p_session_token,p_name,p_image_url)` — samotná definice.
- `leader_delete_npc(p_session_token,p_npc_id)` — definice a všechny placements.
- `leader_add_npc_to_map(p_session_token,p_npc_id,p_map_id,p_x,p_y)` — aktivní
  mapa, viditelné umístění; opakované přidání nepoškodí existující pozici.
- `leader_remove_npc_from_map(p_session_token,p_placement_id)` — pouze umístění.
- `leader_set_npc_position(p_session_token,p_placement_id,p_x,p_y)`.
- `leader_set_npc_visibility(p_session_token,p_placement_id,p_visible)`.
- `map_npcs(p_session_token,p_map_id)` — joined placement a definice pro render.

Mutace i globální seznam ověřují `require_session(...,'leader')`. Player
vidí pouze visible placements aktivní mapy, bez globálního seznamu a bez
NPC bez placementu. Obě tabulky jsou privátní, s RLS a bez přímých grantů.

Realtime používá původní `npc-changes`/`changed` s prázdným `{}` payloadem.
Trigger signalizuje změnu placementů i vytvoření/smazání definice, klient
pak načte autorizovaný stav. Žádná jména, obrázky, ID ani pozice se
broadcastem neposílají. Tabulky nejsou v Postgres Changes publication.

## UI a ověření

Vytvoření přidá NPC pouze do seznamu. Přidat na mapu umístí token na celé
pole poblíž středu. Odebrat z mapy zachová definici. Smazat NPC vyžaduje
potvrzení, které výslovně uvádí odstranění ze všech map.
Visibility a souřadnice patří placementu. Drag, snap a zoom/pan jsou společné
s dosavadním rendererem. Obrázek je volitelná HTTP(S) URL, bez nového uploadu.

Automatické testy:
```
node tests/npcs.cjs
node tests/token-api.cjs
node tests/game-session.cjs
node tests/map-config.cjs
node tests/map-space.cjs
```

SQL test pouze v PRÁZDNÉ jednorázové databázi (vytváří role a session fixture):
```
psql -X -v ON_ERROR_STOP=1 -d <EMPTY_TEST_DATABASE> -f tests/npc-placements-migration.sql
```
Ověřuje převod dat včetně duplicitních názvů, zálohu, autorizaci, hidden a
inactive filtrování, cascade, unikátnost a prázdný broadcast payload.

Po nasazení: leader vytvoří NPC bez umístění, přidá na A, odebere a znovu
přidá, přidá na B a skryje pouze B. Ověřit dvěma browsery realtime a player
Network. Na A zůstane vlastní pozice/visibility. Zrušit globální delete
confirm, pak potvrdit a ověřit smazání ze seznamu i obou map. Reload nesmí
obnovit smazané placementy. Porovnat stará data s `npc_tokens_5a_backup`.
