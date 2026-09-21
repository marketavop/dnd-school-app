# SQL migrace

Před tímto ticketem repozitář neobsahoval SQL migrace ani migrační nástroj.
Tato složka obsahuje samostatné SQL pro existující Supabase/PostgreSQL databázi;
nezavádí nový framework ani nevytváří základní tabulky.

`migrations/20260921120000_extend_characters_sheet.sql` spusťte jednou přes
Supabase SQL Editor nebo existující proces správy cílové databáze. Jeden
`ALTER TABLE` atomicky přidá deset nullable sloupců bez výchozích hodnot
a sedm kontrol rozsahu 1–20. Existující řádky dostanou v nových sloupcích NULL.
Soubor nemění původní sloupce, vazby, RLS, mapové tabulky ani realtime.

Výchozí model `characters` byl zkontrolován proti `PROJECT_BRIEF.md`:
`id uuid PRIMARY KEY`, `user_id uuid NULL REFERENCES auth.users(id) ON DELETE
SET NULL`, `name text NOT NULL`. Živé DDL nebylo k dispozici; před nasazením
ověřte cílové schéma a že sloupce této migrace dosud neexistují.

`int` je v PostgreSQL povolený neuzavřený název sloupce; není nutné jej
přejmenovat ani používat uvozovky. Viz
[PostgreSQL SQL Key Words](https://www.postgresql.org/docs/18/sql-keywords-appendix.html).

## Ověření

Ticket 7 přidává `migrations/20260921130000_extend_characters_xp_hp.sql`.
Spusťte jej jednou po migraci Studentského průkazu. Stejný jediný `ALTER TABLE`
přidává `xp integer NULL`, `current_hp integer NULL`, `max_hp integer NULL`
bez defaultů. Constrainty `characters_xp_check` a `characters_current_hp_check`
povolují NULL nebo hodnotu >= 0; `characters_max_hp_check` NULL nebo hodnotu
>= 1. Vazba `current_hp <= max_hp` se nekontroluje. Žádné triggery, funkce,
RLS ani aplikační změny nejsou součástí migrace.

Samostatný test Ticketu 7 (opět pouze prázdná jednorázová databáze):

```sh
psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/characters-xp-hp-migration.sql
```

Test provede obě migrace, porovná všechna dosavadní data vyplněné i prázdné
postavy, ověří výchozí NULL, přípustné hodnoty, odmítnutí záporných hodnot
a nulového max_hp, návrat na NULL i snížení max_hp pod current_hp.
Vše končí ROLLBACK. V prostředí implementace Ticketu 7 není dostupný psql
ani připojení k živému DDL, proto tento SQL test nebyl spuštěn a migrace
nebyla nasazena. Definice byla zkontrolována proti předchozí migraci a
dokumentovanému základu, nikoli proti živému Supabase.

V prázdné jednorázové testovací PostgreSQL databázi spusťte z kořene repozitáře:

```sh
psql -X -v ON_ERROR_STOP=1 -d <test_database> -f tests/characters-migration.sql
```

Test vytvoří dokumentovaný základ, vloží existující postavu, provede skutečný
migrační soubor a ověří zachování identity, výchozí NULL, hodnoty 1/15/20/NULL
a odmítnutí hodnot -1/0/21/2147483647 u všech šesti vlastností a levelu.
Používá také `int` bez uvozovek v UPDATE a SELECT. Ověří více postav na účet
a ON DELETE SET NULL. Na konci vše vrátí pomocí ROLLBACK.
Test není určen pro produkční databázi ani existující Supabase schéma.

V prostředí implementace nebyl dostupný PostgreSQL/psql, proto tento SQL test
nebyl spuštěn a migrace nebyla aplikována na živou databázi. Existující testy
`node tests/map-space.cjs` a `node tests/map-config.cjs` prošly.
