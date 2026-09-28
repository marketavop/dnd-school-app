# Ticket 6B — HP invariant a persistence

## Nasazení

Po migraci ownership `20260925170000_user_characters_ownership.sql` spusťte
`migrations/20260928120000_character_hp_invariant.sql` jako správce DB.

Pravidla po úspěšném nasazení:

- `current_hp IS NULL OR current_hp >= 0` (existující CHECK).
- `max_hp IS NULL OR max_hp >= 0` (nahrazení původního minima 1).
- Pokud jsou obě hodnoty vyplněné, `current_hp <= max_hp` (nový CHECK).

Nulové maximum je validní. NULL zůstává „nevyplněno“; neprovádí se převod na
nulu ani automatické vyplnění aktuálních HP. Pokud maximum chybí, DB omezuje
aktuální HP pouze zdola. Stávající UI nadále nabízí práci s HP až po vyplnění
obou hodnot.

RPC `player_update_character` už používá jediný UPDATE s CASE: při snížení
maxima pod aktuální HP uloží nové maximum i stejné aktuální HP atomicky.
Nový CHECK ověřuje výsledný řádek tohoto UPDATE a chrání i jiné přímé zápisy.
Souběžné zápisy jsou serializované zámkem řádku; nemůže se commitnout stav
nad maximem. RPC, session a ownership se v tomto ticketu nepřepisují.

Před nasazením může správce prověřit stará data:

```sql
SELECT id, current_hp, max_hp FROM public.characters
WHERE current_hp < 0 OR max_hp < 0
   OR (current_hp IS NOT NULL AND max_hp IS NOT NULL AND current_hp > max_hp);
```

Migrace běží v transakci a constraint validuje nad všemi existujícími řádky.
Pokud narazí na nevalidní stará data, celá se vrátí zpět; žádné postavy sama
neopravuje. Konkrétní starý stav musí správce nejprve vyřešit. Není použitý
`NOT VALID`, který by ponechal staré nevalidní řádky.

## Frontend

Vstup maxima a `lowerCharacterHp` nově přijímají 0. Bez změny layoutu či
autosave. Při každé změně maxima UI převezme z odpovědi také `current_hp`,
i pokud klient kvůli starší lokální hodnotě nepředpokládal serverovou korekci.
HP +/- používá stejný autorizovaný RPC a původní výpočty.

## Ověření 2026-09-28

Cílené Node testy prošly: `character-page.cjs`, `characters.cjs`,
`player-character.cjs`, `leader-players.cjs`. Test stránky nově pokrývá HP
autosave s tokenem přes RPC (table API v tomto testu vyhazuje chybu), readback
do nové instance stránky, +/- , maximum 0, souběžně změněné HP a leader čtení.
Backend je v těchto unit testech náhrada, nikoli důkaz DB constraintů.

Živý test na nakonfigurovaném Supabase přes účet `testplayer`:

| Scénář | Výsledek před nasazením nové migrace |
| --- | --- |
| A: 10/20 → 15/20 | PASS, samostatné RPC načtení vrátilo 15/20 |
| B: 15/20 → max 10 | PASS, odpověď i následné načtení 10/10 |
| C: current -1 | PASS, odmítnuto CHECKem (`23514`) |
| D: max -1 | PASS, odmítnuto CHECKem (`23514`) |
| E: current 25 při max 20 | **FAIL: nasazený server přijal 25/20** |
| F: readback po úspěšném zápisu | PASS, nové HTTP/RPC požadavky vrátily uložená HP |

Nevalidní testovací stav byl ihned opraven, po testu byly původní HP obnoveny
a ověřeny dalším RPC čtením. Živá kontrola F5 v browseru neproběhla; persistence
byla ověřena novým serverovým čtením, reload stránky pouze v unit testu.

**Živá bezpečnostní mezera zůstává otevřená do nasazení migrace a opakování E.**
Migrace nebyla nasazena (není dostupné připojení pro správu DB). `psql` ani Docker
nejsou dostupné, proto SQL integrační test nebyl spuštěn.

Připravený test skutečných migrací (jen v prázdné jednorázové DB):

```sh
psql -X -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/hp-invariant-migration.sql
```

Ověřuje A–E přes autorizované RPC pod `anon`, zachování dat při odmítnutí,
F novou transakcí po COMMIT, NULL, 0, leader read-only a přímý nevalidní SQL UPDATE.

Opakovatelný živý test: `scripts/verify-hp-live.cjs` vyžaduje `HP_LIVE_TEST=1`
a `HP_TEST_PASSWORD`, volitelně `HP_TEST_USERNAME` (výchozí `testplayer`).
Používá stávající public konfiguraci, mění testovací HP a v `finally` je obnoví.
Při zjištěné souběžné změně přeruší práci místo přepsání cizí úpravy. Při pádu
procesu či sítě není možné automatickou obnovu zaručit. Tokeny a hesla neloguje.
