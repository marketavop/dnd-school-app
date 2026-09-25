# Ticket 4A — seznam map pro Vedoucího

Navazující Ticket 4B přidává aktivaci mapy: viz [LEADER_ACTIVE_MAP.md](LEADER_ACTIVE_MAP.md).
Následující text zachycuje původní read-only rozsah 4A.

Po existujících migracích loginu a session spusťte jednou v Supabase SQL
Editoru `migrations/20260924120000_leader_maps.sql`. Vyžaduje stávající
`public.map_config(map_id, cell_size)` a `public.game_state(id, active_map_id)`.

Migrace zakládá neveřejnou `app_private.maps` s metadaty právě dvou
existujících map. Jejich ID, názvy a PNG cesty odpovídají `public/app.js`.
Velikost pole se nekopíruje: RPC ji čte z `map_config`, včetně aktuálních
uživatelských změn. `is_active` se odvozuje pouze z `game_state.id = 1`.
Chybějící map_config nezatají mapu ze seznamu; vrátí NULL cell_size.

`public.leader_maps(p_session_token text)` nejprve volá nezměněné
`app_private.require_session(p_session_token, 'leader')`. Vrací pouze
`map_id, name, image_path, cell_size, is_active`. Funkce je SECURITY DEFINER
s prázdným search_path, volat ji může anon, přístup k datům však podmiňuje
platná leader session. Přímý přístup k tabulce je zakázaný a RLS zapnuté.

Homepage načte seznam při každém otevření Map přes POST RPC. Token je v
těle requestu, nikdy v URL. Seznam nemá editační akce ani realtime odběr;
pro obnovení označení aktivní mapy se vraťte a znovu otevřete Mapy.
Statický registr v herním enginu zůstává pro renderer beze změny; tento
ticket převádí do DB zdroj seznamu, nikoli načítání obrázků v enginu.

## Ověření

- `node tests/leader-maps.cjs`: RPC request, označení aktivní mapy, bezpečné
  vykreslení názvu jako text, frontendové role, chyba, prázdný seznam,
  návrat během čekání na odpověď.
- `node tests/role-home.cjs`, `node tests/leader-players.cjs`,
  `node tests/map-space.cjs`, `node tests/map-config.cjs`: regrese.
- Pouze v **prázdné jednorázové PostgreSQL databázi** spusťte
  `psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/leader-maps-migration.sql`.
  Test vytváří fixture schéma a role a spouští skutečné migrace, které
  commitují DDL. Nepouštějte jej na existující Supabase databázi.
  Ověřuje oba záznamy, přístup leadera, odmítnutí hráče, neplatných a
  expirovaných tokenů, zákaz přímého čtení a původní zdroje aktivního stavu
  a velikosti pole.

Po nasazení proveďte TC1–TC5:

1. Přihlaste `testleader`, otevřete Mapy: jsou zde Test map a Mapa akademie.
2. Porovnejte označení Aktivní s `game_state.id = 1.active_map_id`.
3. S platným tokenem testplayer zavolejte POST `/rest/v1/rpc/leader_maps`
   s JSON `{ "p_session_token": "<player session token>" }` a běžným
   publishable apikey v hlavičce: očekává se odmítnutí, SQLSTATE `42501`.
4. Totéž ověřte s náhodným tokenem a s expirovaným leader tokenem.
   Tokeny nevkládejte do ticketu nebo URL.
5. Otevřete hru ve dvou klientech, ověřte mapu/grid/token, drag a snap,
   realtime pozici a reload; hráčská homepage má stejné akce jako dříve.

V prostředí implementace prošly Node testy a kontrola JS syntaxe.
SQL test nebyl spuštěn (psql není dostupné), migrace nebyla nasazena
a TC1–TC5 proti živému backendu zůstávají k provedení po nasazení.
