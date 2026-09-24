# Jednoduchý login — Ticket 1

## Nasazení

1. V Supabase SQL Editoru jako administrátor spusťte
   `migrations/20260922120000_simple_login.sql`. Předpokládá existující
   `public.characters(id uuid)` a pgcrypto ve standardním schématu `extensions`.
   Pokud je pgcrypto jinde, upravte kvalifikaci jeho funkcí podle cílové DB.
2. Účty připraví administrátor přímo v DB. Použijte unikátní username
   (rozlišuje velikost písmen, bez krajních mezer), bcrypt s cenou 12,
   roli `player` nebo `leader` a případně UUID existující postavy.
   Bezpečným parametrizovaným DB klientem lze spustit:

   ```sql
   INSERT INTO app_private.users (username, password_hash, role, character_id)
   VALUES ($1, extensions.crypt($2, extensions.gen_salt('bf', 12)), $3, $4);
   ```

   Heslo musí mít 1–72 UTF-8 bajtů (limit bcrypt). Nevkládejte reálná hesla
   do repozitáře, sdílených SQL souborů ani logů. Žádné výchozí účty se nevytvářejí.
3. Stávající `public/config.local.js` musí obsahovat URL projektu a veřejný
   publishable key. Není třeba service role key, Supabase Auth ani nový server.
4. Otevřete `/index.html` přes stávající statický server. Pro zachování stávajícího
   vstupu do hráčského UI lze ponechat `?character_id=<UUID>` v URL.

## Hranice ticketu

`public.login` ověřuje heslo serverově pomocí pgcrypto a vrací nanejvýš jeden
řádek s `user_id`, `role`, `character_id`. Nesprávné heslo i neexistující účet
vracejí prázdné pole. Neveřejná tabulka má RLS a odebraná klientská oprávnění.
Funkce má prázdný search_path a explicitní EXECUTE pro anon.
Viz [Supabase database functions](https://supabase.com/docs/guides/database/functions)
a [PostgreSQL pgcrypto](https://www.postgresql.org/docs/18/pgcrypto.html).

`getCurrentUser()` z `public/login.js` poskytuje identitu pouze v paměti aktuálního
dokumentu. Neukládají se cookies, tokeny ani browser storage. Reload vyžaduje login.
Po úspěchu se odkryje dosavadní homepage; obě role mají stejný výsledek.
Role ani character_id zatím neřídí navigaci. Přechod na jinou HTML stránku ukončí
tento běh; návrat domů vyžaduje nové přihlášení. Přímé hráčské stránky, herní data
a jejich oprávnění zůstávají beze změn. Toto není autorizační session pro herní API.
Napojení role na vstup patří do Ticketu 2. Žádný leader dashboard nevzniká.

TC6 znamená kontrolu **odpovědí**: žádné heslo ani hash. Zadané heslo je nutně
v odchozím HTTPS POST requestu a je viditelné odesílateli v DevTools. Po pokusu
se vstup vymaže; chyby se nelogují s přihlašovacími údaji.

## Ověření

`node tests/login.cjs` ověřuje frontend s náhradou backendu: obě role, odmítnutí,
reset při nové instanci dokumentu, povolená pole identity, mazání hesla,
blokaci souběžného submitu a síťovou chybu.

`psql -X -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/login-migration.sql`
ověří skutečnou migraci, bcrypt, role a zákaz čtení pod anon. Pouze pro prázdnou
jednorázovou DB: vytváří základ i role a migrace obsahuje COMMIT.

Na živém projektu po nasazení zopakujte TC1–TC6 se dvěma předem vytvořenými účty.
V Network ověřte pouze POST na RPC, odpověď se třemi poli a odmítnuté čtení účtů.
V tomto prostředí není psql ani přístup ke správě cílové DB; migrace a živé
přihlášení proto nejsou ověřené ani nasazené.
