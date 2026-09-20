# TECH-001 / MAP-001 / MAP-002 – Realtime spike s PNG mapou a mřížkou

Jedna PNG mapa (1536 × 1024 px), jeden token (průměr `CELL_SIZE × TOKEN_SCALE`), řádek
`public.spike_token`, `id = 1`. Souřadnice x/y jsou **střed tokenu**
v přirozených pixelech mapy, počátek (0,0) je vlevo nahoře.
Žádný build, npm, Auth ani aplikační backend.

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
3. Otevřete složku ve VS Code a `index.html` spusťte přes **Live Server →
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
