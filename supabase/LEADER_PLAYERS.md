# Ticket 3B — hráčské postavy pro Vedoucího

Po migracích loginu a tokenů nasaďte
`migrations/20260923130000_leader_players.sql`. Předpokládá již existující pole
deníku z migrací Studentského průkazu a XP/HP. Nemění účty, postavy, login,
session helper ani existující oprávnění herních tabulek.

Obě nové RPC přijímají `p_session_token` a před čtením volají
`app_private.require_session(p_session_token, 'leader')`:

- `leader_players` vrací pouze `character_id, name`.
- `leader_character` navíc přijímá `p_character_id` a vrací pouze pole deníku;
  nevrací účet, heslo, hash ani token.

Seznam zahrnuje existující postavy přiřazené alespoň jednomu účtu s rolí
`player` přes `app_private.users.character_id`. Duplicitní přiřazení nezpůsobí
duplicitní řádek. Deník lze načíst jen pro stejnou množinu postav. Staré
`characters.user_id` navázané na Supabase Auth se nepoužívá. Pro TC1 musí mít
existující `testplayer` přiřazenou `Test Postava`; migrace účty neupravuje.

Hráčský, neplatný a expirovaný token skončí výjimkou `42501` ještě před dotazem
na postavy. Obě RPC mají prázdný search_path, explicitní grant EXECUTE pro anon
a provádějí pouze čtení. Není přidána žádná zapisovací RPC.

## Stejný deník, pouze pro čtení

„Hráči“ otevře seznam ve stávajícím dokumentu. Výběr otevře původní
`character.html` a `character.js` v iframe s `mode=leader`. Nevzniká druhá
šablona deníku ani kopie výpočtů. Rodičovský dokument provede ověřené RPC a
předá deníku pouze data; token zůstává v paměti rodiče. URL neobsahuje token.
Návrat na vedoucí vstup iframe odstraní. Reload celé stránky odstraní paměť
loginu, seznam i deník a vyžaduje nové přihlášení.

V read-only režimu se nevytváří Supabase klient pro přímý přístup k tabulce,
nepřipojují se input/blur/click handlery zápisů, editace a HP tlačítka jsou
skrytá a deaktivovaná, vstupy deaktivované. Výpočty záchran, modifikátorů,
XP a zobrazení HP jsou společné. Samostatně otevřený `mode=leader` bez
rodičovského přihlášeného dokumentu se odmítne; žádný fallback na hráčské načtení.

Původní hráčská stránka a její zapisovací datová vrstva zůstávají zachované.
Tento režim a nové RPC neposkytují zápis. Původní anonymní oprávnění přímého
herního API se tím ale nemění: zákaz ručně vytvořených zápisů přes staré API
vyžaduje samostatné napojení hráčských zápisů na session a úpravu RLS/grantů.
Skrytí ovládání samo takové oprávnění nezajišťuje.

## Ověření

- `node tests/leader-players.cjs`: POST parametry, list/detail, existující HTML,
  bezpečné vykreslení jména, prázdný seznam, chyby, návrat během načítání,
  zamítnutí role a nepřítomnost tokenu v URL.
- `node tests/character-page.cjs`: společný deník v read-only režimu, všechny
  zápisové ovladače bez handlerů, žádný přímý DB klient/zápis, shodné výpočty,
  chyby a stávající hráčské editace.
- `psql -X -v ON_ERROR_STOP=1 -d <disposable_database> -f tests/leader-players-migration.sql`:
  pouze v prázdné jednorázové DB. Test používá skutečné migrace a ověřuje
  leader/player, chybný a expirovaný token, povolená pole, přiřazení a zachování dat.

Osm JavaScript testovacích sad prošlo. SQL test, živé účty a vizuální kontrola
v prohlížeči zatím nebyly ověřeny. SQL migrace není tímto nasazena.

Po nasazení: přihlásit `testleader`, otevřít Hráči → Test Postava, ověřit
záchrany/HP a nepřítomnost možnosti editace. F5 vrátí login. Volání obou RPC
s tokenem `testplayer`, náhodným či expirovaným tokenem musí být odmítnuto.
