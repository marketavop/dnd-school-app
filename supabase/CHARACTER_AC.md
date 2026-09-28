# Ruční AC a poznámka

Před nasazením frontendu aplikujte migraci
`migrations/20260928180000_character_ac.sql` po dosavadních migracích.

- `public.characters.ac`: nullable `integer`, CHECK `ac >= 0` (NULL je povolené).
- `public.characters.ac_note`: nullable `text`; prázdný input ukládá NULL.
- Žádný herní horní limit, automatický výpočet ani vazba na vybavení.
- `player_update_character` rozšiřuje whitelist o `ac` a `ac_note`.
  Zachovává jeden klíč na request, session s rolí player a ownership přes
  `app_private.user_characters`.
- `player_character`, `player_update_character` a `leader_character` vracejí
  obě nová pole. Kvůli změně návratového typu se funkce v jedné transakci
  znovu vytvoří a obnoví se jejich původní EXECUTE grant pro anon.
- Leader seznam se nemění; detail používá stejné read-only UI.

Test DB (psql jako vlastník migrací, po aplikaci všech migrací):
`psql "$DATABASE_URL" -f tests/character-ac-migration.sql`
Test používá testovací účty, běží s rolí anon a změny vrací pomocí ROLLBACK.
Kontroluje read/write, NULL, záporné a desetinné hodnoty, cizí postavu,
neplatný token, zákaz zápisu leaderem, přímý UPDATE a leader detail.

Frontend testy: `node tests/character-page.cjs`, `node tests/characters.cjs`,
`node tests/player-character.cjs`, `node tests/leader-players.cjs`.
Obsahují i selhání autosave, zachování draftu a blur retry pro obě pole.
