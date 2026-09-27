# Příprava velikosti gridu

Po migracích session a seznamu map nasaďte jednou
`migrations/20260924150000_map_preparation.sql` a odpovídající frontend.
SQL zde nebylo nasazeno ani spuštěno: prostředí nemá psql/PostgreSQL.

RPC `leader_set_map_cell_size(p_session_token, p_map_id, p_cell_size)` používá
stávající require_session s rolí leader, ověřuje připravenou mapu a rozsah
20–300 včetně desetinných hodnot. Aktualizuje pouze existující
`map_config.cell_size` daného map_id. Chybějící konfigurace vrátí chybu.
Nemění game_state, token_positions ani PNG. Nevzniká tabulka ani lifecycle
mapy; i aktivní mapu lze připravovat, žádný hard-lock se nepřidává.

Migrace odstraňuje přímé zápisy do map_config pro anon/authenticated/PUBLIC,
včetně sloupcových grantů. Čtení a realtime zůstávají beze změny. Nasazené
map_config musí stejně jako dosud podporovat desetinné cell_size; SQL test
používá numeric a ověřuje přesné uložení 80.5.

Vedoucí otevře Mapy → Připravit. Otevření znovu načte metadata a uložené
cell_size přes leader_maps, nijak neaktivuje vybranou mapu. Preview mění
pouze lokální SVG; teprve Uložit volá nové RPC. Neplatný vstup ponechá
poslední platný náhled, označí input a zakáže uložení. Při chybě requestu
zůstává náhled pro případné opakování; zpráva jasně říká, že uložení selhalo.
Zpět zahodí neuložený náhled, znovuotevření načítá skutečnou DB hodnotu.

Původní funkce renderGrid byla bez změny algoritmu přesunuta do
`public/grid.js`. Hra i `map-preparation.js` volají tutéž implementaci.
Příprava ukazuje PNG a grid bez tokenů, používá přirozené pixely a fit.

V `game.html` je původní input nahrazen neinteraktivním outputem. `app.js`
již nemá input handler, frontu zápisů ani UPDATE map_config. Načtená a
realtime přijatá uložená hodnota dál překresluje grid a mění pouze průměr
tokenů, nikoli jejich x/y. Snap, drag, přepínání map a tokenové RPC/odběry
se nemění. Login, session a brief nebyly upraveny.

Automaticky prošly:

```text
node tests/map-preparation.cjs
node tests/map-config.cjs
node tests/map-space.cjs
node tests/leader-maps.cjs
node tests/game-session.cjs
node tests/token-api.cjs
node tests/navigation.cjs
node tests/role-home.cjs
node tests/login.cjs
```

Přípravné testy ověřují obrázek/uloženou hodnotu, stejný renderer, nulový
zápis při inputu, explicitní zápis a znovuotevření, neplatné vstupy, meze,
desetinné hodnoty, chybu zápisu, dvojklik a opožděnou odpověď jiné mapy.
Regresní testy ověřují uložené config změny přes realtime a tokeny/snap.

SQL autorizaci ověřte pouze v prázdné jednorázové databázi:

```text
psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/map-preparation-migration.sql
```

Test zakládá fixture data a skutečné migrace, které commitují DDL; není
určen pro existující Supabase databázi. Testuje leader/player, neplatnou
a expirovanou session, meze/NULL/NaN/Infinity, desetinné hodnoty, neexistující
mapu, přímý UPDATE a zachování aktivní mapy i tokenových souřadnic.

Manuálně po nasazení:
1. Leader → Mapy → Připravit u akademie: porovnat obrázek a input s DB.
2. Změnit například 90 → 120: grid se změní, DB stále 90. Kliknout Uložit:
   DB 120. Zpět a Připravit: input 120. Druhá mapa má původní hodnotu.
3. Vyzkoušet prázdnou hodnotu, 10, 500, 20, 300 a 80.5. Neplatné nelze
   uložit. Zkontrolovat srozumitelnou chybu při selhání requestu.
4. RPC s player/neplatným/expirovaným tokenem musí být odmítnuté. Přímý
   PATCH map_config také. Nevkládat session tokeny do URL nebo ticketů.
5. Ve hře žádný input velikosti není. Hra načte uložený grid, tokeny zůstanou
   na stejných souřadnicích; drag/drop snapuje podle této velikosti a druhý
   klient přijme pozici bez reloadu. Ověřit přepínání obou map.

Živé testy proti Supabase zůstávají k provedení po nasazení migrace.
