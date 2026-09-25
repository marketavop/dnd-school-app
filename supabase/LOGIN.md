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
řádek s `user_id`, `role`, `character_id` a od Ticketu 3A také `session_token`. Nesprávné heslo i neexistující účet
vracejí prázdné pole. Neveřejná tabulka má RLS a odebraná klientská oprávnění.
Funkce má prázdný search_path a explicitní EXECUTE pro anon.
Viz [Supabase database functions](https://supabase.com/docs/guides/database/functions)
a [PostgreSQL pgcrypto](https://www.postgresql.org/docs/18/pgcrypto.html).

`getCurrentUser()` z `public/login.js` poskytuje identitu pouze v paměti aktuálního
dokumentu včetně `session_token`. Neukládají se cookies ani browser storage. Reload vyžaduje login.
Ticket 2 po úspěchu zobrazí podle `getCurrentUser().role` hráčskou homepage nebo
dočasný vedoucí pohled. Odkazy preferují přiřazené character_id, jinak zachovají
dosavadní URL. Bez postavy či odkazu je vstup do hry neaktivní. Přechod na jinou HTML stránku ukončí
tento běh; návrat domů vyžaduje nové přihlášení. Přímé hráčské stránky, herní data
a jejich oprávnění zůstávají beze změn. Stávající herní API zatím token nekontrolují.
Žádný leader dashboard nevzniká. Ticket 3B aktivuje Hráče a read-only zobrazení
původního deníku; Mapy jsou neaktivní. Viz [LEADER_PLAYERS.md](LEADER_PLAYERS.md).

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
V Network ověřte pouze POST na RPC, odpověď se čtyřmi poli a odmítnuté čtení účtů.
V tomto prostředí není psql ani přístup ke správě cílové DB; migrace a živé
přihlášení proto nejsou ověřené ani nasazené.

## Ticket 3A — krátkodobý token

Po původní login migraci nasaďte `migrations/20260923120000_session_tokens.sql`
ještě před novým frontendem. Mění návratový typ loginu atomickým DROP/CREATE
bez CASCADE; existující účty, hesla a postavy nemění. Starý frontend nové pole
ignoruje, nový frontend bez tokenu login odmítne.

Token vzniká z 32 kryptograficky náhodných bajtů (`gen_random_bytes`, viz pgcrypto
výše), přenáší se jako 64 hex znaků a není odvozen z ID. Neveřejná tabulka
`app_private.sessions` ukládá pouze SHA-256 hash, ID, roli a časy. Platnost je
pevná **8 hodin** pro nově vydané tokeny, bez obnovování. Expirované řádky uklidí další úspěšný login;
validátor je odmítá ihned bez ohledu na úklid. Reload zahodí klientský token,
serverový záznam přirozeně expiruje. Token neposílejte v URL ani do logů.

`public.validate_session(p_session_token text)` je RPC pro ověření tokenu:
vrací právě jeden řádek `user_id, role`. NULL, špatný formát, neexistující nebo
expirovaný token skončí SQLSTATE `42501` s obecnou chybou. Role se kontroluje
i proti aktuálnímu účtu, takže změna role zneplatní starý token.

Budoucí SECURITY DEFINER RPC s prázdným search_path musí **před operací** volat:

```sql
-- V těle serverové funkce; 'leader' je konstanta, nikoliv argument od klienta.
PERFORM * FROM app_private.require_session(p_session_token, 'leader');
```

Helper není klientům dostupný. Při neplatném tokenu či nesprávné roli vyhodí
výjimku; identitu pro další dotazy lze převzít z jeho návratu `user_id, role`.
Klientské getCurrentUser().role slouží pouze pro UI, nikoli jako důkaz oprávnění.
Frontend token zpřístupňuje přes `getCurrentUser().session_token`; pro obnovu
stejné záložky se validovaná identita ukládá pouze do `sessionStorage`. Při načtení
se token ověří přes `public.validate_session`; neplatný či expirovaný token se
odstraní, dočasná síťová chyba uloženou session nemaže. Explicitní „Odhlásit“
vymaže paměť i storage.
Žádné automatické ověřování, nové herní RPC ani změny UI nejsou součástí ticketu.

Test nové migrace v samostatné prázdné jednorázové DB:

```sh
psql -X -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/session-migration.sql
```

Ověřuje obě role, odlišné tokeny opakovaných loginů, uložené hashe, TTL,
validaci pod anon, odmítnutí chybných a expirovaných tokenů, kontrolu leader role,
změnu role účtu a blokaci přímého přístupu. SQL test zde nebyl spuštěn (není
psql ani Docker). JavaScript testy používají náhradu backendu, nikoli živé účty.
