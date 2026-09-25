# D&D mapa – realtime spike a MAP-001 až MAP-007

Velikost gridu se nyní nastavuje přes **Mapy → Připravit → Uložit**,
nikoli ve hře. Nasazení a ověření: [MAP_PREPARATION.md](supabase/MAP_PREPARATION.md).

Upload nových připravených map: [MAP_UPLOAD.md](supabase/MAP_UPLOAD.md).

Aktuální správa hráčských tokenů a zabezpečené RPC jsou popsané v
[PLAYER_TOKENS.md](supabase/PLAYER_TOKENS.md). Starší popisy jednoho tokenu
a přímých zápisů níže zachycují předchozí etapy implementace.

Dvě připravené PNG mapy, jedna sdílená aktivní mapa a jeden token (průměr `cellSize × TOKEN_SCALE`).
Jeho pozice je v `public.token_positions` podle `character_id + map_id`. Souřadnice x/y jsou **střed tokenu**
v přirozených pixelech mapy, počátek (0,0) je vlevo nahoře.
Žádný build, npm ani Supabase Auth. Login ověřuje malá serverová SQL funkce.

## Jednoduché přihlášení — Ticket 1

Ticket 3B aktivuje „Hráči“ pro Vedoucího. Seznam a detail načítají nové RPC
ověřující leader session. Otevírá se původní deník v režimu pouze pro čtení,
bez nové šablony. Nasazení a testy: [supabase/LEADER_PLAYERS.md](supabase/LEADER_PLAYERS.md).

Ticket 10 zachovává vlastní `public.login` a `session_token`, ale po loginu jej
uloží do `sessionStorage` a při refreshi ověří přes `public.validate_session`.
Chráněné stránky čekají na ověření před inicializací deníku/mapy; neplatná
session se smaže, dočasná síťová chyba ji nemaže. Logout smaže paměť i storage.
Nové tokeny mají po migraci `20260924160000_session_ttl_8_hours.sql` platnost
8 hodin. Supabase Auth, cookies ani refresh tokeny se nepřidávají.

Ticket 6A převádí hráčský deník na serverově autorizované RPC s kontrolou
session, role a vazby účtu na `character_id`. Přímý klientský přístup k tabulce
`characters` je migrací odebrán; postup a SQL test jsou v
[supabase/PLAYER_CHARACTER.md](supabase/PLAYER_CHARACTER.md).

Ticket 3A přidává `session_token` pouze v paměti klienta. Server ukládá jeho hash
a ověřuje identitu, roli a pevnou expiraci za 30 minut. Před novým frontendem
nasaďte migraci `20260923120000_session_tokens.sql`; podrobnosti a rozhraní
validátoru jsou v [supabase/LOGIN.md](supabase/LOGIN.md#ticket-3a--krátkodobý-token).
Herní RPC ani UI se tímto ticketem nemění.

Ticket 2 rozděluje vstup podle `getCurrentUser().role`: hráč dostane původní
nabídku, Vedoucí samostatný pohled bez „Můj deník“, s položkami „Vstoupit do hry“,
„Hráči“ a „Mapy“. Mapy jsou neaktivní, Hráče aktivuje Ticket 3B. Odkazy do existujících
obrazovek využijí přiřazené `character_id`; pokud chybí, zůstává dosavadní
odkaz z URL. Bez obojího je vstup do hry neaktivní. Neplatná role neotevře žádný
pohled. Login mechanismus, SQL, hráčské obrazovky i herní oprávnění se nemění.
`node tests/role-home.cjs` ověřuje rozdělení rolí, izolaci, odkazy a reload
s náhradou backendu; živé účty `testplayer` a `testleader` tím nejsou ověřené.

Úvodní stránka nyní nejprve zobrazí username + heslo. Identita (`user_id`,
`role`, `character_id`) existuje pouze v paměti; reload znovu zobrazí login.
Po úspěchu se odkryje nabídka podle role (Ticket 2 výše). SQL migraci je před
použitím nutné nasadit a účty předem připravit.
Postup, hranice ticketu a ruční testy jsou v [supabase/LOGIN.md](supabase/LOGIN.md).

Všech šest JavaScript testovacích sad prošlo včetně `node tests/login.cjs`.
SQL test a přihlášení proti živému Supabase zatím ověřeny nejsou.

## MAP-010 – responsivní mapa

Mapa se celá vejde do viewportu širokého 100 % a vysokého 70 % okna, bez
vlastních scrollbarů. Celý map-space (PNG, grid i token) používá společný
scale `min(šířka viewportu / šířka mapy, výška viewportu / výška mapy, 1)`.
ResizeObserver aktualizuje pouze transformaci; přirozené rozměry a uložené
x/y zůstávají stejné. Drag převádí pointer zpět do původních pixelů mapy.

Ověření: `node tests/map-space.cjs` a `node tests/map-config.cjs`.
V prohlížeči otevřete hru, měňte velikost okna a přepněte obě mapy:
celý obrázek musí zůstat uvnitř viewportu a x/y se nesmí změnit.
Při zmenšené mapě přetáhněte token, ověřte snap, shodné x/y v druhém
klientu a zachování pozice po reloadu. Starší popisy scrollování níže
popisují stav před MAP-010.

## Záchrany ve vlastnostech – Ticket 9

Každá karta obsahuje vypočítanou Záchranu a neklikací tečku `●` pro proficiency.
Malá mapa `SAVE_PROFICIENCIES` v `public/character.js` obsahuje dvojice pro
12 povolání podle Ticketu 9. PB je pro level 1–20 `2 + Math.floor((level - 1) / 4)`.
NULL nebo neznámé povolání nepřidává proficiency; NULL level nepřidává PB,
ale tečka podle známého povolání zůstává. NULL vlastnost má prázdný bonus.
Záporná čísla a nula se zobrazují bez přidaného plus, kladná s plus.

Vlastnost přepočítává modifier i záchranu okamžitě. Povolání a level mění
záchrany až po potvrzeném zápisu. Selhání zápisu vlastnosti obnoví i záchranu.
Datová vrstva ani DB se nemění, odvozené bonusy se neukládají.
Konkrétní pravidlo tohoto ticketu nahrazuje obecnou zmínku briefu o ručním
označování save proficiency; tento ticket žádné takové ovládání nezavádí.

Prošly testy stránky (včetně všech povolání a hranic PB), datové vrstvy,
navigace, oba mapové testy a kontrola syntaxe. V prohlížeči zbývá ověřit
čitelnost řádku a tečky, kompaktní mřížku 3 × 2 a přepočty při skutečném
uložení levelu/povolání. Živý Supabase ani vizuální browser test nebyly spuštěny.

## XP a HP – Ticket 8

Studentský průkaz načítá také `xp`, `current_hp` a `max_hp`. XP se mění přes
tužku na blur (NULL nebo celé číslo >= 0). Zbývající XP používají hranice
2014 ze zadání; pro prázdné XP/level a level 20 se údaj nezobrazuje. Dosažená
hranice zobrazí informaci, level se nikdy automaticky nemění.

HP zobrazují aktuální/maximum, NULL jako pomlčku. Ovládání `[−] [počet] [+]` přidá nebo odečte zadaný kladný počet HP.
Výchozí počet je 1 (nejde o výchozí HP postavy); výsledek se omezí na 0..max_hp. Bez maxima nebo
aktuálních HP je vstup neaktivní s vysvětlením. Přes tužku lze zadat maximum
(NULL nebo celé číslo >= 1) i aktuální HP (NULL nebo 0..max_hp; bez maxima
lze zadat jen NULL nebo 0). Nastavení maxima samo neinicializuje aktuální HP.

Snížení maxima pod aktuální HP používá účelovou funkci `lowerCharacterHp`
ve stávajícím `characters.js`: jeden atomický UPDATE obou HP na nové maximum.
Ostatní změny používají `updateCharacterField`. Během HP zápisu jsou HP
ovladače neaktivní. Při chybě se vrací potvrzené hodnoty a sdílený autosave
hlásí selhání; SQL schéma, RLS ani mapová logika se nemění.

Prošly testy `character-page.cjs`, `characters.cjs`, `navigation.cjs`,
`map-space.cjs`, `map-config.cjs` a kontroly syntaxe obou skriptů deníku.
Test stránky ověřuje XP hranice, NULL, clamp, přímé HP vstupy, atomický payload,
selhání obou způsobů zápisu, blokaci souběžných HP akcí a reload s náhradou DB.
Ručně zbývá ověřit kompaktnost layoutu v prohlížeči, ovládání tlačítek a blur,
oprávnění a zápisy/reload v živém Supabase včetně atomického snížení HP.

## Homepage a hra – Ticket 6

Otevřete `public/index.html?character_id=<UUID>` přes místní server (při
servírování složky public přímo `/index.html?character_id=<UUID>`).
Homepage nabízí „Můj deník“ a „Vstoupit do hry“. Odkazy vedou na
`character.html` a `game.html` se stejným ID; obě stránky mají „← Domů“,
které ID zachovává. Bez platného jednoznačného UUID jsou hlavní odkazy
neaktivní a zobrazí se vysvětlení. Návrat Domů bez platného ID vede na
`index.html` bez parametru.

Původní mapové HTML je v `public/game.html`. `navigation.js` spustí původní
`app.js` pouze s platným UUID; mapa používá toto ID místo dřívější pevné
testovací postavy. CSS, mapové ovladače a mapová logika zůstávají zachované.
Neexistuje výchozí postava ani nový výběr postavy/auth flow.

Prošly `node tests/navigation.cjs`, `node tests/character-page.cjs`,
`node tests/characters.cjs`, `node tests/map-space.cjs`,
`node tests/map-config.cjs` a kontroly syntaxe `navigation.js` a `app.js`.
Mapové testy pouze doplňují URL do simulovaného prostředí. V prohlížeči
zbývá ověřit celé flow s reálnou postavou, návraty a mapový realtime/drag
ve dvou klientech proti živé DB.

## Šest vlastností

Pod průkazem jsou karty STR, DEX, CON, INT, WIS a CHA v mřížce 3 × 2
(na úzké obrazovce dva nebo jeden sloupec). Hodnoty se upravují přímo,
nezávisle na tužce průkazu. NULL znamená prázdný input i modifikátor.
Modifikátor se počítá pouze v prohlížeči jako `Math.floor((score - 10) / 2)`;
kladné číslo má `+`, nula je `0`.

Karty používají stejné ukládání a společný stav jako průkaz. Blur ukládá jen
změněnou hodnotu (NULL nebo celé číslo 1–20). Neplatný vstup i selhání backendu
vrací potvrzenou hodnotu a její modifikátor; validní vstup odstraní validační
hlášku. Modifikátory se neposílají do DB.

`node tests/character-page.cjs` ověřuje všech šest polí, příklady modifikátorů,
reload nad náhradou DB, NULL, neplatné hodnoty, opravu validace a chybu zápisu.
Prošly také testy `characters.cjs`, `map-space.cjs`, `map-config.cjs` a
`node --check public/character.js`. Ručně zbývá ověřit vizuální rozložení,
vejití průkazu a karet do okna notebooku, ovládání skutečných number inputů
a zápisy/reload proti živé DB včetně stávajících RLS.

## Editace Studentského průkazu

Průkaz se načítá v read-only režimu. Tužka zapne editaci jména, rasy,
povolání a levelu přímo na místě hodnot; ikona zavření ji ukončí. Horní nadpis
„Deník postavy“ je odstraněn, hlavním nadpisem je „Studentský průkaz“.
Portrét zůstává beze změny. Každé změněné pole se ukládá při blur přes
`updateCharacterField`; zavření není samostatný příkaz k uložení.

Rasa a povolání mají pevné seznamy, včetně prázdné položky pro NULL;
`halfling` se zobrazuje jako „Půlčík“. Level lze vymazat na NULL nebo zadat
celé číslo 1–20. Prázdné či pouze mezerové jméno a neplatný level se neukládají:
pole zobrazí chybu a vrátí poslední potvrzenou hodnotu. Stejně se hodnota
obnoví při selhání backendu. Stav průkazu hlásí „Ukládám…“, „Uloženo“ nebo
„Nepodařilo se uložit“. Během zápisu je jen zapisované pole neaktivní;
ostatní pole lze upravovat. Úspěch jiného pole nezakryje nevyřešenou chybu.

Spuštěné testy: `node tests/character-page.cjs`, `node tests/characters.cjs`,
`node tests/map-space.cjs`, `node tests/map-config.cjs`,
`node --check public/character.js`. Vše prošlo. Test stránky používá skutečný
skript/datovou vrstvu s náhradou DOM a Supabase; pokrývá editaci, blur,
opětovné načtení, NULL, validaci, nezměněné hodnoty, selhání i souběh zápisů.
Živé DB zápisy, RLS a vizuální kontrola v prohlížeči nebyly provedeny.

## Samostatný deník postavy – Ticket 3

Otevřete `/character.html?character_id=<UUID>` na stejném serveru jako mapu,
kde `<UUID>` nahradíte ID existující postavy. Chybějící, prázdný, opakovaný nebo
syntakticky neplatný parametr zobrazí zprávu bez inicializace Supabase a bez
dotazu na postavu. Není použita žádná výchozí testovací postava.

Stránka používá `config.local.js`, stejnou verzi Supabase SDK a stejné nastavení
klienta jako mapa. Přes `loadCharacter` načte Studentský průkaz: kulatý portrét
nebo placeholder, jméno, rasu, povolání a level. Editaci popisuje sekce výše. NULL se
zobrazuje jako nenápadná pomlčka. Chyba načtení zobrazí zprávu; technický detail
je v konzoli. Stránka nemá mapové závislosti ani realtime.

Lokální české názvy v `public/character.js` používají kódy ras `human`, `elf`,
`halfling`, `dwarf`, `gnome`, `half_elf`, `half_orc`, `tiefling` a povolání
`barbarian`, `bard`, `cleric`, `druid`, `fighter`, `monk`, `paladin`, `ranger`,
`rogue`, `sorcerer`, `warlock`, `wizard`. Neznámý kód zobrazí „Neznámá rasa“
nebo „Neznámé povolání“. Portrét přijímá webovou cestu nebo HTTPS URL;
konkrétní Supabase Storage bucket není definován a stránka jej nevymýšlí.
Chybějící nebo nedostupný obrázek ponechá placeholder.

Ověření: `node tests/character-page.cjs`, `node tests/characters.cjs`,
`node tests/map-space.cjs`, `node tests/map-config.cjs` a
`node --check public/character.js` prošly. Test stránky spouští její skript
i skutečnou datovou vrstvu s náhradou DOM a SDK. Ověřuje parametr URL, read-only
dotaz na správné ID, NULL, překlady, bezpečné vykreslení textu, placeholder
a chybové stavy. Vizuální kontrola v prohlížeči a načtení proti živé databázi
nebyly provedeny; skutečné RLS a nasazení migrace je nutné ověřit v cílovém
prostředí bez rozšiřování oprávnění.

## Datová vrstva postavy – Ticket 2

`public/characters.js` exportuje dvě samostatné funkce. Obě přijímají existující
Supabase klient `db`, který vzniká na konci `public/app.js`; nevytvářejí další
klient ani automatické dotazy. Budoucí UI je může použít po inicializaci `db`:

```js
import { loadCharacter, updateCharacterField } from './characters.js';

const character = await loadCharacter(db, characterId);
const updated = await updateCharacterField(db, characterId, 'str', 15);
await updateCharacterField(db, characterId, 'str', null);
const reloaded = await loadCharacter(db, characterId);
```

Načtení i zápis vracejí `id`, `user_id`, `name`, `portrait_path`, `race_code`,
`class_code`, `level`, `str`, `dex`, `con`, `int`, `wis`, `cha` bez náhrady NULL.
Zápis mění právě jedno pole existující postavy podle `id`; povolená jsou jen
uvedená pole kromě `id` a `user_id`. `undefined` je odmítnuto, pro vyprázdnění
nullable pole použijte `null`. Rozsahy hodnot kontroluje databáze.

Při selhání funkce zaloguje technický detail přes `console.error` a vyhodí
chybu; volající musí odmítnutý Promise zpracovat pomocí `try/catch`.
Také chybějící/nepřístupný řádek nebo UPDATE bez vráceného řádku je chyba,
nikoli úspěch. Zápis používá `update(...).eq('id', ...).select(...).single()`
a vyžaduje odpovídající oprávnění ke čtení i aktualizaci. Auth/RLS nemění.

Ověření: `node tests/characters.cjs`, `node tests/map-space.cjs`,
`node tests/map-config.cjs`, `node --check public/characters.js` a
`node --check public/app.js` prošly. Test postavy používá náhradu Supabase:
ověřuje NULL, jednotlivé zápisy a následné čtení, ochranu systémových polí,
izolaci jiné postavy, chybějící řádek a logování/předání databázových i síťových
chyb. Živá databáze, nasazení migrace z Ticketu 1 a skutečné RLS/constrainty
nebyly tímto testem ověřeny. UI ani automatické načítání deníku nevzniklo.

## MAP-007 – pozice postavy pro jednotlivé mapy

Původní ověření používalo postavu
`d16ac8a0-ba74-40e7-8402-c75cfe3a4ab6` z `characters`.
Od Ticketu 6 určuje postavu parametr `character_id` na `game.html`.
Jde o ID testovací postavy, nikoliv přihlášeného uživatele. `spike_token`
už aplikační kód nečte, nezapisuje a neposlouchá.

Po aktivaci mapy se připojí samostatný realtime odběr pozic a poté se
načte `token_positions` s filtry na obě hodnoty: postavu a aktivní mapu.
Chybějící řádek je normální stav: token je skrytý a stránka oznámí, že
postava nemá na této mapě uloženou pozici. Nevytváří se výchozí pozice.

Po dokončení dragu se provede jediný upsert s `character_id`, `map_id`,
`x`, `y` a `onConflict: 'character_id,map_id'`. DB proto musí mít unikátní
klíč této dvojice a umožňovat SELECT/INSERT/UPDATE. Frontend schéma nemění.
Snap nadále používá aktuální grid; během dragu se nezapisuje.

Realtime sleduje INSERT i UPDATE: server filtruje aktivní `map_id`,
callback navíc ověřuje `character_id` i mapu. Při přepnutí se starý kanál
odstraní, starý token ihned skryje a načte se pozice nové mapy. Dodatečný
INSERT pro postavu a aktivní mapu token zobrazí bez reloadu. Opožděné
odpovědi ani callbacky předchozího odběru nepřepíšou novou mapu. Upsert
rozpracovaný při přepnutí dokončí zápis do původní mapy. Nevzniká UI pro
přidávání tokenů ani více postav.

Ověření 2026-09-21:

- `node --check public/app.js`, `node tests/map-space.cjs` a
  `node tests/map-config.cjs` prošly. Test celého app.js s náhradou DOM/DB
  ověřuje počátečních 375/375, upsert + reload + realtime, prázdnou
  akademii, pozdější INSERT, oddělené pozice a návrat na původní mapu.
  Také ignorování jiné postavy/mapy, odstranění starých odběrů, chybu
  upsertu, opožděné čtení/zápis, INSERT během počátečního SELECTu a regrese
  gridu, map, dragu a snapu. Mock odmítne jakýkoliv přístup ke `spike_token`.
- Skutečná DB potvrdila testovací postavu, `test-map = 375/375` a chybějící
  řádek akademie. Backendový test ověřil kompozitní upsert na 525/525,
  opětovné čtení a UPDATE do dvou nezávislých WebSocket spojení. Odběr
  akademie změnu test-map nedostal. INSERT akademie na 225/225 dorazil
  přes realtime a nezměnil pozici test-map.
- Test následně obnovil **test-map = 375/375** a odstranil pouze svůj
  nově vytvořený řádek akademie; ta je opět bez pozice. `game_state`,
  `map_config`, `characters` ani `spike_token` tento backendový test neměnil.
- Browserový nástroj stále selhává při inicializaci. Vizuální test
  skutečného frontendu nebyl proveden; backendový test ho nenahrazuje.

Ruční ověření: ve dvou klientech zvolte test-map a zkontrolujte 375/375.
Přesuňte token, ověřte shodnou pozici v B bez reloadu a pak po reloadu.
Přepněte na akademii: token musí zmizet. V Supabase vytvořte v
`token_positions` řádek s výše uvedeným `character_id`,
`map_id = 'mapa-akademie'`, např. `x = 225`, `y = 225`; token se má objevit
bez reloadu. Návrat na test-map musí obnovit její vlastní uloženou pozici.
V Network po dropu očekávejte jeden POST (upsert) do `token_positions`,
žádný request do `spike_token`.

## MAP-006 – přepínání aktivní mapy (pozice nově řeší MAP-007)

Dropdown **Aktivní mapa** obsahuje statický registr `MAPS` v `public/app.js`:

| ID | Název | Soubor | Rozměry |
| --- | --- | --- | --- |
| `test-map` | Test map | `public/assets/maps/test-map.png` | 1536 × 1024 px |
| `mapa-akademie` | Mapa akademie | `public/assets/maps/mapa-akademie.png` | 1310 × 1200 px |

Zdroj pravdy je `public.game_state.id = 1`, sloupec `active_map_id`.
Velikost gridu se načítá z `public.map_config` podle `map_id` a zapisuje
se pouze do tohoto řádku. `spike_map_config` už frontend nepoužívá.
Obě tabulky musí umožňovat SELECT/UPDATE a mít zapnuté Realtime UPDATE.
Schéma ani oprávnění frontend nemění.

Po připojení realtime odběrů se načte aktivní mapa a její konfigurace.
PNG, grid a token se zobrazí až po načtení obrázku i konfigurace.
Změna dropdownu uloží `active_map_id`; druhý klient přepne mapu,
input velikosti, grid i průměr tokenu bez reloadu. Reload načte aktivní
mapu i její uloženou velikost. Validace 20–300 px zůstává zachovaná.

Opožděná odpověď konfigurace předchozí mapy nepřepíše právě aktivní mapu.
Zápis velikosti zahájený před přepnutím dokončí zápis do původního `map_id`.
Neznámé ID mapy, chybějící konfigurace a chyba PNG se zobrazí jako chyba.
Při chybě zápisu mapy se dropdown vrátí na poslední známou aktivní mapu.

`spike_token` zůstává společný pro obě mapy. Přepnutí nezapisuje x/y;
pozice se zobrazí na nové mapě se stávajícím omezením na její hranice.
Přepnutí během dragu tento rozpracovaný pohyb zruší bez zápisu.
Další drag/drop snapuje podle gridu aktuální mapy. Map-specific token
positions, role a správa knihovny map nejsou implementované.

Ověření 2026-09-21:

- `node --check public/app.js`, `node tests/map-space.cjs` a
  `node tests/map-config.cjs` prošly.
- Test celého aplikačního kódu se dvěma oddělenými kontexty a náhradou
  DOM/Supabase ověřuje přepínání A → B i B → A, cesty PNG a jejich rozdílné
  rozměry, vlastní velikost gridu každé mapy, návrat, reload, token realtime
  a snap, validaci, selhání zápisu/načtení, pomalý obrázek, přepnutí během
  dragu a opožděné odpovědi konfigurace. Přepnutí nezapisuje do tokenu.
- Skutečné Supabase GET potvrdily aktivní `test-map` a oba řádky
  `map_config` s velikostí 100.
- Živý backendový test přes REST a dvě nezávislá WebSocket spojení ověřil
  zápis i doručení přepnutí na akademii a zpět, změnu jejího gridu na 150,
  nezměněnou konfiguraci test-map, opětovné čtení DB a nezměněný token.
  Test vrátil původní aktivní mapu i velikosti: **test-map, 100 / 100**.
  Použit [Supabase Realtime protokol](https://supabase.com/docs/guides/realtime/protocol).
- Vizuální test skutečného frontendu ve dvou browserech zůstává
  neprovedený: browserový nástroj selhává při inicializaci. Backendový
  test neověřuje vykreslení PNG a ovládání dropdownu v browseru.

Ruční přijetí: spusťte statický server nad `public` (např.
`python -m http.server 8001 --bind 127.0.0.1 --directory public`) a otevřete
`http://127.0.0.1:8001` ve dvou browserech. V A vyberte akademii a ověřte
stejnou PNG mapu a input v B. Nastavte její grid na 150; přepněte v B na
test-map, která musí zachovat 100. Nastavte test-map na 80 a vraťte se
na akademii: musí načíst 150. Reload obou musí zachovat aktivní mapu
i velikost. Nakonec ověřte drag, snap a realtime tokenu. Samotná změna
mapy ani gridu nesmí poslat PATCH na `spike_token`.

Níže následují historické záznamy předchozích ticketů; aktuální tabulky
a chování určuje sekce MAP-006 výše.

## MAP-005B – původní konfigurace (nahrazena MAP-006)

Aktuálním zdrojem pravdy je `public.spike_map_config`, řádek `id = 1`,
sloupec `cell_size`. Frontend tabulku ani řádek nevytváří. Pro tento spike
musí být dostupné SELECT/UPDATE a tabulka zařazená do `supabase_realtime`.

Po připojení realtime odběru se načte velikost z DB a nastaví input, grid
i průměr tokenu. Do úspěšného načtení je input a drag blokovaný; 100 px je
jen dočasná výchozí hodnota. Reload načte poslední uloženou velikost.
Každá platná změna inputu ihned aktualizuje náhled a zapíše `cell_size`.
Rychlé lokální změny se zapisují postupně v pořadí zadání. Realtime UPDATE
řádku 1 aktualizuje druhého klienta bez dalšího zápisu. Konfliktní editace
z více klientů se neřeší.

Validace 20–300 px zůstává zachovaná. Neplatná hodnota nic nezapisuje.
Samostatná zpráva pod inputem ukazuje načítání, ukládání nebo chybu.
Při neúspěšném zápisu se náhled vrátí na poslední známou uloženou velikost;
reload ověří skutečný stav DB. Změna velikosti nemění střed tokenu ani
nezapisuje do `spike_token`. Snap při dalším dropu používá aktuální grid.

Ověření 2026-09-21:

- Skutečný Supabase GET vrátil HTTP 200 a `cell_size = 100`.
- `node --check public/app.js`, `node tests/map-space.cjs` a
  `node tests/map-config.cjs` prošly.
- Nový test spouští celý app.js ve dvou oddělených kontextech s náhradou
  DOM/Supabase: start 100, A → B na 150, B → A na 80, reload obou,
  neplatné vstupy bez zápisů, nezměněný střed, rychlé změny v pořadí,
  chyba zápisu, chyba načtení a regrese token realtime + snap + reload.
- Živý zápis a realtime přenos mezi browsery v tomto kroku neověřeny:
  browserový nástroj selhává při inicializaci. Test s náhradou Supabase
  neověřuje skutečnou publication ani oprávnění UPDATE.

Ruční přijetí: otevřete dva klienty, ověřte 100 z DB, v A zadejte 150 a
ověřte změnu v B; v B zadejte 80 a ověřte A. Reload obou musí načíst 80.
Prázdný vstup, 10 a 500 nesmí poslat PATCH. Porovnejte x/y před a po změně
gridu a pak otestujte drag/drop: snap na aktuální pole, přenos tokenu do
druhého klienta a zachování pozice po reloadu.

## MAP-005 – původní lokální náhled (nahrazen MAP-005B)

Nad mapou je číselný vstup **Velikost pole (px)**. Každá platná změna
okamžitě překreslí grid a nastaví průměr tokenu na `cellSize * TOKEN_SCALE`.
Výchozí hodnotu 100 px určuje `CELL_SIZE` v `public/app.js`; snadno
upravitelné meze jsou `MIN_CELL_SIZE = 20` a `MAX_CELL_SIZE = 300`.
Povolena jsou i desetinná čísla v tomto rozsahu.

Prázdný vstup hlásí „Zadej velikost pole.“, hodnota mimo rozsah hlásí
„Zadej velikost pole od 20 do 300 px.“. Neplatný číselný zápis má vlastní
hlášku. Input má při chybě červený okraj a `aria-invalid`; text je přímo
pod ním. Grid i token zůstávají v posledním platném stavu. Platná hodnota
chybu odstraní a aktualizuje náhled.

Změna velikosti nemění uložené ani zobrazené x/y, neposílá požadavek do DB
a nepřepočítává snap. Ani u kraje se střed neposouvá: zvětšený token může
do dalšího pohybu přesahovat mapu. Až další drag/drop použije dosavadní
snap algoritmus MAP-004 s aktuální platnou velikostí pole. Nastavení je
lokální pro jednu stránku, nesynchronizuje se a po reloadu se vrátí na 100.

Aktuální soubory frontendu jsou ve složce `public`. Pro lokální spuštění
z kořene repozitáře použijte `python -m http.server 8001 --bind 127.0.0.1 --directory public`
a otevřete `http://127.0.0.1:8001`. Browser načítá konfiguraci z
`public/config.local.js`.

Ověření MAP-005 (2026-09-21):

- `node --check public/app.js` a `node tests/map-space.cjs` prošly.
- Test se skutečnými handlery a náhradou DOM/DB ověřuje default, změnu
  100 → 80 (token 90 → 72 px), hodnoty 20/300 a desetinnou hodnotu,
  prázdný vstup, 10/500, neplatný číselný zápis a návrat na platnou hodnotu.
- Ověřeny nezměněný střed u kraje, uložená pozice i rozměry map-space,
  žádný zápis při náhledu, změna před načtením PNG a default při novém běhu.
- Regresní testy dragu, scrollu, hran a snapu prošly. Drop při platné
  velikosti 80 a následném neplatném vstupu nadále snapuje do 80px gridu
  a zapíše právě jednou.
- Živé browserové TS1–TS9 v tomto kroku nebyly provedeny: browserový nástroj
  selhal při inicializaci i po resetu. Skutečný realtime a persistence
  nebyly znovu testovány; jejich mechanismus zůstává beze změny.

Ruční kontrola: po reloadu ověřte 100; změňte na 80 a porovnejte střed
tokenu; vyzkoušejte prázdný vstup, 10 a 500; vraťte platnou hodnotu.
Ověřte meze 20/300 i token u kraje. Reload musí obnovit 100.
Nakonec přetáhněte token, ověřte snap, přenos do druhého klienta a jeho
pozici po reloadu. Samotná změna velikosti nesmí v Network poslat PATCH.

## MAP-003 – velikost hráčského tokenu

V `app.js` je `TOKEN_SCALE = 0.9`. Průměr kruhového tokenu je
`CELL_SIZE * TOKEN_SCALE`: pro pole 100 px tedy 90 px, pro 80 px pak 72 px.
Token logicky zabírá jedno pole. Při umístění do středu pole zůstává
na každé straně mezera 5 % šířky pole; snap není implementovaný.
CSS již nemá pevné rozměry tokenu. `translate(-50%, -50%)` zachovává
střed a bounds používají přesný poloměr odvozený ze stejného průměru.
Pro výchozí mapu a 90px token jsou středy omezené na
x = 45…1491, y = 45…979. Pokud stará pozice po zvětšení tokenu
už nesplňuje bounds, uplatní se dosavadní vizuální omezení na hranici
bez automatického přepisu DB. Jinak změna velikosti střed neposune.

Ověření MAP-003 (2026-09-20):

- `node --check app.js` a `node tests/map-space.cjs` prošly;
  aktualizovaný test ověřuje 90px velikost, stejný střed, všechny čtyři
  hranice, drag, scroll, zrušení pohybu i zápis pouze po dropu.
- V browseru při změně `CELL_SIZE` 100 → 80 a reloadu klesl průměr
  90 → 72 px, střed zůstal 654/250. Konstanta je vrácena na 100.
- Drag přes grid a skutečný Supabase ve dvou kartách: A → B na 508/206,
  B → A na 578/266, obojí přijato přes realtime bez reloadu.
  Reload B načetl střed 578/266 (poslední testovací pozice v DB).
- Nezávislé profily browserů nebyly testovány; použity dvě karty jednoho profilu.
- DB schema, význam x/y, realtime, map-space a grid geometrie zůstávají
  stejné. Žádný snap, grid-coordinate persistence ani sizing systém.

## MAP-002 – čtvercová mřížka

SVG `#grid` leží mezi PNG a tokenem uvnitř `#map-space`. Po načtení PNG
dostane její přirozené rozměry i odpovídající `viewBox`. Svislé a vodorovné
SVG `<line>` začínají v (0,0); rozestup obou směrů řídí jediná konstanta
`CELL_SIZE = 100` v `app.js`. Interně **1 pole = 5 ft**.
Pro změnu rozestupu nastavte kladnou hodnotu konstanty a obnovte stránku.
Grid nemá výplň a má `pointer-events: none`. Token se pohybuje volně,
bez snapu. Realtime, DB schema ani drag logika se pro tento ticket nemění.
Snap, zoom/pan, měření a movement validation nejsou implementované.
Čtvercový grid odpovídá zadání MAP-002; původní brief s hex gridem
zůstává nezměněný.

Ověření MAP-002 (2026-09-20):

- Syntaxe JS a `node tests/map-space.cjs` prošly, včetně regresí dragu.
- V browseru: 27 čar, rozestup 100 px, shodný počátek a rozměry
  SVG/map-space 1536 × 1024; výplň `none`, pointer-events `none`.
  Poslední čáry jsou x = 1500 a y = 1000, zbývající okrajová pole
  mají šířku 36 px a výšku 24 px.
- Resize na 1000 × 1100 zachoval zarovnání mapy a SVG.
- Skutečná změna konstanty na 80 a reload vytvořily 33 čar
  (x = 0, 80, 160, 240…), bez změny rozměrů. Vráceno na 100.
- Drag přes grid funguje. Dvě karty se skutečným Supabase:
  B → A přijato bez reloadu na 328/256; A → B na 438/216;
  reload B načetl 438/216. To je poslední testovací pozice v DB.
- Nezávislé browserové profily zde nebyly dostupné; realtime je
  ověřený ve dvou kartách stejného profilu.

## MAP-001 – společný prostor

`assets/maps/test-map.png` a token jsou potomci `#map-space`. Jeho rozměry
se nastaví po načtení PNG z `naturalWidth` a `naturalHeight`. Mapa zůstává
1:1; `#map-viewport` poskytuje běžný scroll v obou osách. Resize nemění
souřadnice ani nezapisuje do DB. Drag počítá pozici vůči aktuálnímu
obdélníku map-space, takže zahrnuje i scroll během tažení a zachová místo úchopu.

Pro 40px token jsou povolené středy x = 20…1516, y = 20…1004.
Omezení se používá i na načtené/realtime pozice. Starší hodnoty z DB se
nově interpretují jako střed; schema ani data se automaticky nemigrují.
Hodnoty mimo hranice se pouze zobrazí na nejbližším povoleném místě;
opravená pozice se uloží až při skutečném přesunu. Do načtení mapy je
token skrytý, při chybě PNG se zobrazí samostatná zpráva.

### Ověření MAP-001 (2026-09-20)

- `node --check app.js` a `node tests/map-space.cjs` prošly. Test handlerů
  ověřuje čekání na PNG, rozměry, střed a místo úchopu, scroll během dragu,
  všechny čtyři hrany, jediný UPDATE po dropu, cancel, klik bez přesunu
  a zobrazení starší pozice mimo hranice bez automatického zápisu.
- V browseru ověřeno: PNG i map-space mají 1536 × 1024 CSS px,
  token má společného rodiče a jeho vizuální střed odpovídá x/y.
  Menší viewport mapu neořezává natrvalo ani neškáluje; má scrollbary.
- Skutečný Supabase ve dvou kartách: A → B na 268/316,
  B → A bez reloadu na 218/116. Reload načetl uloženou pozici 418/196
  z předchozího přesunu; pozdě otevřená třetí karta načetla 218/116.
- Resize viewportu na 700 × 800 a 1000 × 900 zachoval rozměry mapy
  i shodu vizuálního středu tokenu se souřadnicemi.
- Zbývá ručně zopakovat realtime testy v **nezávislých kontextech**
  (Chrome + Edge / anonymní okno). Dostupný automatizační browser má jen
  karty jednoho profilu. Hrany a scroll během aktivního dragu jsou
  automaticky ověřeny s náhradou DOM; vhodné je i ruční projetí všech hran.
- Poslední testovací pozice v DB: **218/116**.

Pro ruční TS1–TS8 z ticketu použijte kašnu či lavičku jako rozpoznatelný
bod. U resize porovnejte x/y před a po, včetně reloadu. U hran kontrolujte
celý kruh tokenu a hodnoty 20/1516, respektive 20/1004. Při scrollování
musí mapa i token cestovat společně.

### Původ testovací mapy

Vygenerováno vestavěným nástrojem imagegen, uloženo v
`assets/maps/test-map.png`. Použitý prompt:

> Create one PNG top-down orthographic fantasy school courtyard battle map,
> 1536x1024 pixels landscape. Use case: stylized-concept. Painted stone
> courtyard with central round fountain, grassy corners, a few trees,
> benches and stone paths, distinct landmarks for testing token placement.
> Flat overhead view with clear walkable surfaces. No grid, no hexes,
> no labels, no text, no characters, no tokens, no frame. This is a static
> test map asset for a D&D web app.

## Konfigurace a spuštění

1. V kořeni repozitáře zkopírujte `config.example.js` na `config.local.js`.
2. V `config.local.js` doplňte `SUPABASE_URL` (Project URL) a
   `SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_...`) z připraveného projektu.
   Zachovejte uvozovky a `export const`. Soubor je v `.gitignore`.
   Publishable key je určený pro browser a návštěvník jej může přečíst;
   nikdy nepoužívejte secret ani service_role key. Klíč nedávejte do ticketu.
3. Otevřete složku ve VS Code a `public/index.html` spusťte přes **Live Server →
   Open with Live Server** (pokud rozšíření používáte). Alternativa s Pythonem:

   ```powershell
   cd D:\dnd-school-app
   python -m http.server 8000 --bind 127.0.0.1
   ```

   Na tomto počítači je dostupný i Python dodaný s Codexem:

   ```powershell
   & 'C:\Users\vopat\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe' -m http.server 8000 --bind 127.0.0.1
   ```

4. Otevřete `http://127.0.0.1:8000` (u Live Serveru jeho URL/port).
   Neotevírejte HTML přes `file://`: používá ES moduly. Statický HTTP server
   pouze podává soubory; DB a realtime poskytuje přímo Supabase.
5. Počkejte na **Realtime: připojeno**, **Načteno z DB.** a viditelný token.
   Při prvním spuštění má pozici 100/100, pokud zatím nikdo řádek nezměnil.

Je potřeba internet pro CDN i Supabase. Knihovna je připnutá na
`@supabase/supabase-js@2.57.4` a načítá se jako browserový ES modul z jsDelivr.
Použitý mechanismus: [Supabase Postgres Changes](https://supabase.com/docs/guides/realtime/postgres-changes).

## TS1–TS5

Připravte klient A v Chrome a klient B v Edge (případně běžné a anonymní
okno). Dvě běžné karty stejného profilu nejsou test nezávislých kontextů.
Oba klienti musí mít tutéž lokální URL a konfiguraci. Pohybujte vždy jen
v jednom klientovi; současné konfliktní pohyby jsou mimo tento spike.

| Test | Postup | Očekávaný výsledek |
| --- | --- | --- |
| TS1 – A → B | Otevřete A i B, počkejte na připojení a porovnejte x/y. Přetáhněte token v A na jiné místo a pusťte. | A hlásí Uloženo do DB. B bez reloadu hlásí Přijato přes realtime a má shodné x/y. V Supabase Table Editoru obnovte `spike_token` a zkontrolujte x/y řádku 1. |
| TS2 – B → A | Přetáhněte token v B na jiné místo a pusťte. | B potvrdí uložení, A bez reloadu přijme shodnou pozici. |
| TS3 – reload | Přesuňte token v A, počkejte na uložení a poznamenejte x/y. Reloadněte B. | B po načtení z DB zobrazí poslední x/y. |
| TS4 – pozdní připojení | Zavřete B. V A změňte pozici a počkejte na uložení. Znovu otevřete B na téže URL. | B načte poslední x/y z DB, přestože během změny neběžel. |
| TS5 – bez continuous drag | V A otevřete DevTools → Network, zapněte záznam, vyčistěte seznam a filtrujte `spike_token`. Držte token a několik sekund s ním pohybujte. Poté jej pusťte na jiné pozici. | B se během tažení nehýbe. Během pohybu nevznikne žádný PATCH; po puštění vznikne přesně jeden PATCH na `spike_token?id=eq.1…` s x/y. Následně se pohne B. OPTIONS preflight ani websocket heartbeat nejsou UPDATE. |

Klik bez změny pozice ani zrušený pointer pohyb nezapisují. Při chybě
uložení aplikace zobrazí chybu a vrátí poslední známou uloženou pozici;
reload ověří skutečný stav DB. Během ukládání je další drag blokovaný.
Realtime callback pouze mění zobrazení, neposílá další UPDATE.

## Historické ověření TECH-001 (před MAP-001)

- Kontrola JavaScript syntaxe (`node --check app.js`).
- Kontrola, že Git ignoruje `config.local.js` a brief zůstal nezměněný.
- Test handlerů s náhradou DOM a DB: načtení, 30 pointermove bez zápisu,
  jeden zápis po dropu, opakovaný pointerup, zrušení pohybu, drop beze změny
  a návrat pozice při chybě zápisu.
- Otevření stránky v browseru a zobrazení chyby nedoplněné konfigurace.

Po opravě lokální konfigurace ověřeno proti skutečnému Supabase
(2026-09-20), ve dvou kartách browseru Codexu:

- Oba klienti načetli z DB počáteční pozici 100/100.
- TS1: drag v A uložil 260/160; B přijal 260/160 přes realtime bez reloadu.
- TS2: drag v B uložil 380/240; A přijal 380/240 přes realtime bez reloadu.
- TS3: po reloadu B načetl 380/240 z DB.
- TS4: B byl zavřený, A uložil 180/140; nově otevřený B načetl 180/140 z DB.
- Poslední testovací pozice ponechaná v DB: **180/140**.

**Zbývá k úplnému přijetí:** zopakovat TS1–TS5 v nezávislých kontextech
(např. Chrome a Edge). Automatické ovládání zde nabízelo pouze browser
Codexu; dvě karty stejného profilu tento požadavek nepotvrzují. TS5 je
ověřený testem handlerů s náhradou DB a kontrolou kódu, ale počet PATCH
requestů během skutečného dragu nebyl změřen v Network. Připojení,
realtime a persistence proti skutečnému backendu již blokované nejsou.

Pokud SELECT/UPDATE vrací permission denied, ověřte oprávnění `anon`
k SELECT/UPDATE připravené tabulky (samotné vypnutí RLS granty nepřidává).
Pokud funguje zápis, ale ne realtime, ověřte připojení websocketu a zařazení
`public.spike_token` do `supabase_realtime` publication. Frontend schéma ani
oprávnění nemění. Při chybě připojení se řiďte stavem na stránce a Network;
po opravě konfigurace proveďte reload.
