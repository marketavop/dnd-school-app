# Ticket 4B — aktivní mapa

## Nasazení

Po migraci Ticketu 4A spusťte jednou
`migrations/20260924130000_leader_set_active_map.sql` v Supabase SQL Editoru.
RPC `leader_set_active_map(p_session_token, p_map_id)` ověří leader session
pomocí existujícího require_session, existenci mapy v app_private.maps a
změní pouze active_map_id na game_state.id = 1. Neexistující mapa vrací
SQLSTATE 22023; neplatná, expirovaná nebo player session 42501.
Chybějící řádek game_state je chyba; RPC ho nevytváří.

Migrace také odebírá anon/authenticated/PUBLIC přímé zápisy do game_state,
včetně sloupcových oprávnění pro id a active_map_id. SELECT a realtime se
nemění. Starý přímý PATCH již nesmí fungovat.

## Frontend

`leader-map-api.js` obsahuje společné loadMaps/setActiveMap; obě UI používají
stejné RPC. Sekce Mapy nabízí u neaktivní mapy Aktivovat a po úspěchu znovu
načte seznam. Při čekání blokuje další aktivaci. Seznam nemá nový realtime
kanál; při dalším otevření se obnoví z DB.

Leader vstup do hry otevře game.html v iframe uvnitř homepage. Stávající
session je pouze v paměti homepage; nemění se login ani ukládání tokenu.
Rodič předává pouze funkce volající stejný mapový API modul. Token není
v URL ani předáván do iframe. Leader nepotřebuje vlastní postavu; tento
pohled pouze sleduje mapu a umožňuje její přepnutí, nespravuje hráčské tokeny.
Po reloadu homepage je nutné přihlášení, stejně jako dosud.

Herní select je dostupný jen v leader pohledu a seznam získává z leader_maps.
Hráč ho nevidí a jeho handler odmítá změnu. Existující game_state realtime
kanál dále spouští activateMap: obrázek, grid a map-specific pozici. Registr
obrázků stávajícího rendereru zůstává beze změny; jeho širší zabezpečení ani
oprávnění pro grid a tokeny tento ticket neřeší.

Změněné FE: index.html, leader-maps.js, role-home.js, navigation.js,
game.html a vstup/ovládání mapy v app.js. Nové: leader-map-api.js,
leader-game.js. Drag/snap, map-space, tokenový realtime, tokenové souřadnice,
login.js, require_session a brief se nemění.

## Testování

Node testy: leader-maps.cjs, map-config.cjs, map-space.cjs, navigation.cjs,
role-home.cjs, login.cjs ve složce tests. Map-config zahrnuje simulovaný
player klient: odmítnutí vlastního přepnutí a přijetí změny od leadera bez
reloadu, správný obrázek/grid a skrytí chybějící pozice.

Pouze v prázdné jednorázové databázi:
`psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/leader-set-active-map-migration.sql`.
Test obsahuje skutečné migrace a ověřuje leader zápis, neexistující mapu,
player/neplatný/expirovaný token a zákaz přímého UPDATE.

Manuálně po nasazení:
1. Testleader → Mapy → Aktivovat: označení se přesune na zvolenou mapu.
2. Zpět → Vstoupit do hry: přepněte mapu selectem, obrázek/grid se změní.
3. Ve druhém nezávislém browseru přihlaste testplayer a otevřete hru.
   Nemá výběr mapy; po leader změně se bez reloadu přepne. Ověřte oba směry.
4. Zavolejte RPC s player, náhodným a expirovaným tokenem: odmítnutí.
   Leader s neexistující map_id: odmítnutí a původní active_map_id zachované.
5. Přepněte z mapy s pozicí na mapu bez pozice a zpět: token zmizí a vrátí
   se na původní souřadnice. Ověřte drag, snap, realtime a reload pozice.

Node testy prošly. SQL test ani klíčový živý test leader → player nebyly
v prostředí implementace provedeny: není dostupné psql ani nasazená nová
migrace. Dokončení acceptance vyžaduje nasazení a uvedené manuální scénáře.
