# Mazání neaktivních map

Migrace: `migrations/20261001160000_leader_map_delete.sql`.
Edge Function: `leader-map-delete` (stejné nastavení gateway/custom session jako
`leader-map-upload`; session přichází v `x-session-token`, nikoliv jako Supabase JWT).
Service role klíč zůstává pouze v Edge Function.

RPC `leader_delete_map` je dostupná pouze `service_role`, ověřuje však také
leader session. Delete i aktivace zamykají nejprve `game_state(id=1) FOR UPDATE`.
Existence cílové mapy se kontroluje až po získání zámku. Mazání aktivní mapy
vrací `PT409`. Chybějící game state operaci odmítne.

Delete v jedné transakci odstraní NPC placements, případné backup řádky,
map_config (existující cascade odstraní token_positions) a mapu. Vrací původní
image_path. Globální NPC a postavy se nemění. Migrace předpokládá potvrzený
produkční FK `token_positions.map_id -> map_config.map_id ON DELETE CASCADE`.

Po commitu Edge Function odstraní pouze objekt s přesným uploadovým formátem
`maps/<UUID>.(png|jpg|jpeg|webp)`. Lokální a jiné cesty přeskočí. Storage chyba
vrací HTTP 200 s `deleted: true`, `storage_cleanup: failed` a warningem
`STORAGE_CLEANUP_FAILED`: DB smazání je dokončeno, obrázek vyžaduje ruční úklid.
Server log obsahuje map_id a klíč objektu, nikoli session. Není zde automatický
retry ani obnova dat. Pád mezi DB commitem a cleanupem může zanechat objekt;
nepotvrzený DB výsledek vrací `DELETE_UNCONFIRMED`. UI obnoví seznam a netvrdí,
že operace byla plně dokončena. Opakované smazání chybějící mapy vrací 404.

## Testy

`node tests/map-delete.cjs` a `node tests/leader-maps.cjs` ověřují Edge handler
a UI včetně Cancel, konfliktu, dvojkliku, opožděné odpovědi a Storage warningu.

Pouze v prázdné jednorázové PostgreSQL databázi, nikdy v produkci:

```sh
psql -X -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/map-delete-migration.sql
```

SQL fixture obsahuje potvrzené FK a izolovaný session stub; skutečnou session
validaci pokrývají stávající session testy. Následně nastavte
`MAP_DELETE_TEST_DATABASE_URL` na stejnou testovací DB a spusťte:

```sh
node tests/map-delete-race.cjs
```

Race test používá dvě skutečná spojení, čeká na blokování druhého na zámku
a ověří obě pořadí commitů. Vyžaduje `psql` a oprávnění číst `pg_stat_activity`.
