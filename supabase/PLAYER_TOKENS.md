# Hráčské tokeny ve společné mapě

## Nasazení

Po migracích session a seznamu map z Ticketu 4A (a přepínání map z 4B)
spusťte jednou `migrations/20260924140000_player_tokens.sql`.
Počítá se stávajícími `token_positions(character_id, map_id, x, y)` a unikátní
dvojicí `(character_id, map_id)`. Pozice ani postavy se nemigrují a nemění.
Frontend a tuto migraci nasaďte společně; původní přímé zápisy již nefungují.

## RPC a oprávnění

| Operace | RPC | Přístup |
| --- | --- | --- |
| Seznam hráčských postav včetně chybějících pozic | `leader_player_tokens(p_session_token, p_map_id)` | Jen leader |
| Vlastní postava včetně případné pozice | `player_token(p_session_token, p_map_id)` | Jen player; postavu určuje server podle účtu |
| Přidání | `add_token(p_session_token, p_character_id, p_map_id, p_x, p_y)` | Leader libovolnou hráčskou postavu, player pouze vlastní |
| Přesun | `set_token_position(p_session_token, p_character_id, p_map_id, p_x, p_y)` | Stejné ověření vlastnictví |
| Odebrání | `remove_token(p_session_token, p_character_id, p_map_id)` | Stejné ověření vlastnictví |

Všechny funkce používají stávající `app_private.require_session`. Malý
neveřejný helper `require_token_access` společně ověřuje platnou session,
vazbu účtu na postavu a existenci připravené mapy. Role ani vlastnictví se
nepřebírají z URL nebo požadavku klienta. Leader může spravovat pouze
postavy přiřazené alespoň jednomu hráčskému účtu. Seznam vrací jen
character_id, name, portrait_path, x a y; chybějící pozice má x/y NULL.

Přidání je INSERT ON CONFLICT DO NOTHING: opakování nevytvoří duplikát ani
nepřesune existující token. Přesun je UPDATE existujícího řádku, aby pozdní
drop nevzkřísil token mezitím odebraný jiným klientem. Odebrání maže jen
konkrétní dvojici postava + mapa. Nejde o obecný systém řešení konfliktů.

Migrace odebírá přímý INSERT/UPDATE/DELETE/TRUNCATE včetně sloupcových grantů
rolím PUBLIC, anon a authenticated. RLS ani stávající SELECT oprávnění se
nemění: čtení potřebné pro dosavadní Postgres Changes zůstává zachované.
Tento ticket uzavírá tokenové zápisy, ne veškeré čtení herních dat ani
oprávnění ostatních tabulek.

## Společný frontend

`app.js` nyní drží malý záznam stavu pro každou načtenou postavu. Každý
token je stejný DOM prvek uvnitř původního map-space; sdílí render, drag,
snap a velikost `cell_size * TOKEN_SCALE`. Leader načítá všechny hráčské
postavy, player nadále pouze svou. Portrét se použije, pokud existuje;
při chybě obrázku zůstane počáteční písmeno jména.

Vedoucí má seznam Hráči ve scéně s Přidat/Odebrat. Odebrání používá stávající
potvrzovací dialog. Během dragu není žádný zápis; drop uloží snapnutou pozici.
Resize a změna cell_size nemění souřadnice. Bez pozice je token skrytý.
Selhání zápisu vrací poslední známou pozici a zobrazí srozumitelnou zprávu
u postavy; technické podrobnosti jsou v konzoli.

`token-api.js` je malý klient těchto konkrétních RPC. `leader-game.js`
zpřístupní stejné funkce oběma herním pohledům v iframe. Player nyní stejně
jako leader otevírá hru uvnitř homepage, aby mohl použít již existující
session v paměti. Token se nepřenáší do URL ani do úložiště prohlížeče.
Login a session model se nemění. Samostatný game.html bez session požádá
o vstup z homepage; podvržené character_id v URL neurčuje vlastnictví.
Po reloadu celé homepage je stejně jako dříve nutné nové přihlášení.

## Realtime

Zůstává jeden Postgres Changes odběr token_positions pro aktivní mapu,
se stejnými INSERT/UPDATE/DELETE událostmi. Změna mapy odběr vymění a
zruší rozpracovaný drag. Každý token má vlastní stav a kontrolu opožděných
odpovědí; nedokončený zápis staré mapy neovlivní novou scénu.

DELETE odebíráme bez serverového filtru, pak porovnáváme map_id a character_id
lokálně. Migrace nastaví REPLICA IDENTITY FULL. Pokud událost obsahuje pouze
primární klíč a nelze z ní určit dvojici postava/mapa, obnoví se aktuální
pozice přes RPC. Nezavádí se polling, nový kanál ani kontinuální drag.
Při DELETE rozpracovaného tokenu se jeho drag zruší.
Viz [Supabase: obsah old při DELETE a RLS](https://supabase.com/docs/guides/troubleshooting/realtime-postgres-changes-troubleshooting).

## Automatické testy

Spuštěno a prošlo:

```text
node tests/map-space.cjs
node tests/map-config.cjs
node tests/token-api.cjs
node tests/game-session.cjs
node tests/navigation.cjs
node tests/role-home.cjs
node tests/login.cjs
node tests/leader-maps.cjs
node tests/leader-players.cjs
```

Testy vykonávají skutečný aplikační kód s náhradou DOM, RPC a Realtime.
Pokrývají více tokenů, přidání/přesun/odebrání, DELETE pouze s primárním
klíčem, zrušení potvrzení, selhání zápisu, pozdní odpovědi, oddělené mapové
pozice, player/leader pohled, snap, scale, grid a zachování session v paměti.
Nejsou důkazem živého spojení ani serverové autorizace.

V **prázdné jednorázové PostgreSQL databázi** spusťte:

```text
psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/player-tokens-migration.sql
```

SQL test zakládá dva hráče (A na test-map, B bez pozice), leader účet a
nepřiřazenou postavu. Provádí skutečné migrace a testuje autorizaci všech
tří zápisových RPC, player pokus o cizí character_id, leader-only seznam,
neplatné/expirované session, přímé zápisy, opakované přidání, pozdní drop
po smazání a zachování postavy, účtu i jiné mapy. Není určen do produkce:
migrace commitují DDL, ROLLBACK na konci vrací jen testovací data.

SQL test nebyl zde spuštěn: není dostupné psql/PostgreSQL. Migrace nebyla
nasazena a živý test ve dvou browser kontextech zůstává k ověření.

## Manuální acceptance po nasazení

1. Použijte dvě existující hráčské postavy A/B s přiřazenými účty. A má na
   test-map pozici; B ne. Nevytvářejte duplicitní postavy jen pro frontend.
2. Přihlaste Vedoucího a otevřete hru. A je vidět, B má Přidat. Je-li u A
   portrait_path, token používá portrét. V druhém browseru přihlaste hráče B.
3. Vedoucí přidá B: objeví se oběma klientům. Přesune jej: během dragu se
   druhý klient nehýbe, po dropu přijme snapnutou pozici bez reloadu.
4. Vedoucí odebere B: zmizí oběma, v seznamu zůstane Přidat. Ověřte také
   zrušení potvrzení a chybu requestu — bez úspěšného smazání token zůstává.
5. Hráč A přesune vlastní token. Vedoucí změnu přijme. Přepněte mapu s jinou
   pozicí A a zpět: obnoví se příslušná pozice. Na mapě bez řádku token není.
6. Player session zavolá add_token/set_token_position/remove_token s cizím
   character_id: vždy odmítnutí 42501 a žádná změna. Stejně odmítněte
   leader_player_tokens s player session a všechny operace s neplatným či
   expirovaným tokenem. Přímý REST zápis do token_positions musí selhat.
7. Při výpadku spojení a po připojení ověřte načtení posledního stavu; po
   novém přihlášení se načtou stejné uložené souřadnice. Zkontrolujte, že
   postavy, deníky a pozice na ostatních mapách zůstaly zachované.
