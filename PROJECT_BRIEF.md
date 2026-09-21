# PROJECT BRIEF --- Webová aplikace pro dětské D&D

**Stav dokumentu:** výchozí scope pro MVP\
**Verze:** 1.0.4\
**Pravidlový základ:** D&D 5e (2014)\
**Cílová skupina:** přibližně 10 uživatelů\
**Deadline první hratelné verze:** přibližně 20 dní od zahájení vývoje

------------------------------------------------------------------------

## 1. Vize projektu

Vytváříme jednoduchou webovou aplikaci pro online hraní D&D 5e 2014 s
dětmi v prostředí kouzelnické školy.

Nechceme vytvořit vlastní Roll20, Foundry ani univerzální VTT.
Existující nástroje jsou pro děti příliš složité: vyžadují znalost
rozhraní a často i znalost pravidel ještě před tím, než dítě začne
skutečně hrát.

Hlavní princip projektu:

> **Dítě nemá ovládat VTT. Má hrát D&D.**

Postava vzniká postupně během příběhu a výuky. Aplikace poskytuje místo
pro zapisování naučených mechanických informací, pomáhá s rutinní
matematikou a poskytuje jednoduchý společný herní prostor s mapou.

Aplikace nemá učit pravidla místo PJ a nemá hrát za dítě.

------------------------------------------------------------------------

## 2. Produktové principy

-   **PJ vede hru → dítě vede svou postavu → aplikace hlídá mechanickou
    rutinu.**
-   **Aplikace nabízí. PJ instruuje. Dítě provádí.**
-   **Dítě rozhoduje o postavě. Aplikace počítá rutinní matematiku. PJ
    vysvětluje proč.**
-   Strukturovat informaci neznamená automatizovat její pravidla.
-   Jednu informaci zadáváme pokud možno pouze jednou.
-   Neimplementujeme mechaniku jen proto, že existuje v D&D. Musí ji
    skutečně potřebovat naše kampaň.
-   Web je mechanická podpora online D&D. Papírový deník slouží primárně
    pro lore, školu, příběh a vlastní poznámky.
-   Na mapě optimalizujeme pro rychlé použití. V plném deníku pro správu
    a učení.
-   Jednoduché, dokončené a pochopitelné řešení má přednost před
    dokonalou architekturou.
-   Nová funkce je standardně „Později", dokud neprokážeme, že ji první
    hraní potřebuje.

------------------------------------------------------------------------

## 3. Kontext vývoje

Vývojářka je testerka/analytička se základy HTML, CSS, JavaScriptu, VS
Code a Gitu. Cílem není pouze nechat aplikaci vygenerovat AI, ale při
vývoji jí rozumět.

Počítáme konzervativně přibližně se 4 hodinami práce denně. Vyšší
dostupnost je rezerva, nikoliv důvod rozšiřovat scope.

Pracovní technický směr:

-   vanilla HTML/CSS/JavaScript,
-   Cloudflare pro web/deployment,
-   externí služba pro autentizaci, data a realtime,
-   Supabase pro autentizaci, data a realtime,
-   Git pro zdrojový kód, nikoliv herní stav.

Technologický směr není nezměnitelný. Stack se nemá měnit bez
konkrétního problému, který změna řeší.

Realtime synchronizace je kritická technická část a musí být ověřena
velmi brzy.

### Codex

Codex používáme jako implementačního pomocníka, ne jako produktového
architekta.

Úkoly pro Codex mají být malé a testovatelné. Ticket má podle potřeby
obsahovat:

-   problém,
-   cíl,
-   rozsah,
-   co je mimo rozsah,
-   acceptance criteria,
-   co se nesmí měnit,
-   testovací scénáře.

První technický spike má ověřit: **dva klienti + jedna mapa + jeden
token + synchronizovaná změna pozice**.

------------------------------------------------------------------------

## 4. Role a účty

Existují přesně dvě role:

1.  **Hráč**
2.  **Vedoucí**

Vedoucí zahrnuje PJ i organizátora. Oba mají stejná oprávnění.

Třetí role nevznikne, dokud nebude existovat konkrétní problém, který
dvě role nedokážou vyřešit.

Účty dětí budou vytvořeny předem. MVP nemá self-registration.

Platí:

> **1 účet = 1 dítě. Jeden účet může mít více postav v čase. Každá postava má vlastní deník a právě jeden hráčský token se stejnou stabilní identitou jako postava.**

Postava používá databázové `character_id` typu UUID. Hráčský token nepoužívá samostatné token ID; pro hráčskou postavu používá stejné `character_id`.

Hráč může číst a upravovat pouze svůj deník. Vedoucí může číst deníky
všech hráčů, ale v MVP je neupravuje.

------------------------------------------------------------------------

## 5. Základní uživatelský flow

Po přihlášení hráč uvidí jednoduchou domovskou stránku:

-   **Můj deník**
-   **Vstoupit do hry**

Máme jednu skupinu/kampaň, takže neexistuje výběr kampaně.

Vedoucí navíc vidí jednoduchý seznam hráčů/postav a může otevřít jejich
deníky read-only.

Nevytváříme dashboard, uživatelský profil, notifikace ani složité
nastavení.

------------------------------------------------------------------------

## 6. Vznik postavy

Postava nevzniká pomocí character-builder wizardu.

Vzniká postupně během příběhu. Například dítě dostane dopis z akademie,
podpisem vznikne jméno postavy, během cesty se učí používat kostky a ve
škole postupně objevuje a zapisuje další části deníku.

> **Pořadí vyplňování postavy určuje příběh a PJ, nikoliv aplikace.**

Relevantní části deníku mohou být viditelné od začátku a prázdné. Nemáme
odemykání sekcí, progression UI ani procenta dokončení.

------------------------------------------------------------------------

## 7. Deník postavy

Používáme označení **Deník postavy / školní deník**, nikoliv „character
sheet".

Mentální model je školní deník / studentský průkaz.

Existují dva pohledy nad stejnými daty:

1.  **Plný deník** --- správa a učení.
2.  **Kompaktní panel na mapě** --- rychlé použití během hry.

Nevytváříme dvě kopie dat.

Kompaktní panel se otevře nad částí mapy a pravděpodobně bude mít
několik záložek. Přesné členění zatím není uzavřené. Kandidáti jsou
Přehled / Hody / Boj / Kouzla / Věci.

Každá informace v mapovém panelu musí odpovědět na otázku: **potřebuje
ji dítě běžně během session?**

### První výukový řez deníku

První session nezačíná plným deníkem. Pro první výukový řez stačí:

- **Studentský průkaz**: portrét/token, jméno, rasa, povolání, level,
- **šest vlastností**: STR, DEX, CON, INT, WIS, CHA,
- automaticky dopočítané modifikátory vlastností.

HP, AC, rychlost, proficiency bonus, skills, saves, iniciativa, pasivní
vnímání, útoky, kouzla, spell sloty, inventář a další části plného deníku
zůstávají v celkovém scope, ale přidávají se až ve chvíli, kdy je děti
při výuce skutečně potřebují.

První výukový řez se má na běžném notebooku vejít na jednu obrazovku bez
scrollování. Nezavádíme kvůli tomu progression UI ani odemykání sekcí;
jde pouze o pořadí implementace a výuky řízené PJ.

------------------------------------------------------------------------

## 8. Web vs. papírový deník

Papírový deník je primární místo pro:

-   lore,
-   školní poznámky,
-   příběh,
-   NPC poznámky,
-   lekce,
-   vlastní zápisky a vzpomínky.

Web je primárně mechanická podpora online D&D.

Výjimkou je **Příběhové pozadí**, protože PJ k němu potřebuje během
vyprávění rychlý přístup.

Rozlišujeme:

-   **Zázemí / Background** --- mechanický D&D údaj.
-   **Příběhové pozadí** --- jednoduché free-text pole.

Web může mít také jednoduché obecné **Poznámky** pro situační informace.

------------------------------------------------------------------------

## 9. Studentský průkaz

Studentský průkaz je kompaktní horní blok deníku. Pro první výukový řez
obsahuje:

-   kulatý portrét/token,
-   jméno,
-   rasa,
-   povolání,
-   level.

Další identitní údaje, například zázemí a XP, mohou být doplněny později
v plném deníku podle toho, kdy je děti začnou používat.

Běžný stav průkazu je **read-only**. V rohu je nenápadná ikona tužky,
která přepne celý průkaz do editace. Jméno je textové pole, rasa a
povolání jsou výběry ze seznamu a level je jednoduché číselné pole.
Jednotlivé změny se ukládají automaticky po opuštění pole; nepoužíváme
samostatné tlačítko Uložit.

Portrét postavy je zároveň obrázkem hráčského tokenu. Portrét i token se
zobrazují jako kruh. Změna portrétu se spouští kliknutím přímo na portrét.
V MVP používáme jednoduché automatické centrování a kruhové zobrazení;
nevytváříme editor avatarů, cropper, zoom, rotaci ani ruční posun obrázku.
Ruční posun je **Později**, pouze pokud se při skutečném použití ukáže
jako potřebný.

V MVP neevidujeme:

-   alignment,
-   božstvo/víru jako systém,
-   personality traits,
-   ideals,
-   bonds,
-   flaws,
-   velikost hráčské postavy.

------------------------------------------------------------------------

## 10. Rasa, povolání a zázemí

Pravidlovým základem je D&D 5e 2014.

Rasa a povolání jsou v prvním výukovém řezu vybírány z pevného seznamu,
nejsou free-text. V datech používáme stabilní systémové kódy a v UI
zobrazujeme české názvy. Samostatné databázové tabulky ras a povolání pro
MVP nevytváříme.

Povolené rasy jsou základní rasy PHB 2014 používané v této kampani:
člověk, elf, hobit, trpaslík, gnóm, půlelf, půlork a tiefling.
**Drakorozený se v této kampani nepoužívá.** Podrasy a varianty jsou mimo
MVP.

Povolání vybíráme ze základních povolání PHB 2014. Multiclass v MVP
neřešíme.

Zázemí zůstává samostatným mechanickým D&D údajem plného deníku a dítě ho
vyplní ve chvíli, kdy k němu příběh/PJ dojde.

Princip:

> **Dítě vybere → aplikace stručně poradí → dítě samo zapíše mechanické
> změny.**

Aplikace automaticky neaplikuje mechanické důsledky rasy, povolání nebo
zázemí. Stabilní kódy pouze ponechávají možnost později přidat konkrétní
jednoznačnou automatiku, pokud pro ni vznikne ověřená potřeba.

Featy jsou Budoucnost.

Případné části specifické pro povolání řešíme jako společné jádro
deníku + malé specifické části, nikoliv jako 12 samostatných deníků.

------------------------------------------------------------------------

## 11. Vlastnosti, dovednosti a záchranné hody

Používáme šest vlastností:

-   STR — Síla,
-   DEX — Obratnost,
-   CON — Odolnost,
-   INT — Inteligence,
-   WIS — Moudrost,
-   CHA — Charisma.

Dítě zadává hodnoty vlastností samo. Hodnoty mohou zůstat prázdné, dokud
se k nim při výuce nedojde. Nevyplněná hodnota nemá žádný zobrazený
modifikátor.

Pro aktuální MVP je platná hodnota vlastnosti celé číslo **1--20**.
Hodnota se edituje přímo v kartě vlastnosti a validuje se při opuštění
pole. Neplatná hodnota se neuloží a UI vrátí poslední platnou hodnotu.

Aplikace automaticky vypočítá modifikátory vlastností jako rutinní
matematiku. Modifikátory se do databáze neukládají; počítají se z aktuální
hodnoty. Kladné hodnoty zobrazujeme se znaménkem `+`, záporné se `-` a
nulový modifikátor jako `0`.

V prvním výukovém řezu je všech šest vlastností vidět najednou jako šest
stejně velkých karet v mřížce 3 × 2. Každá karta má malou jednoduchou
ikonu, český název, anglickou zkratku a vedle sebe hodnotu a modifikátor.
Všechny karty mají jednotný vizuální styl; nepoužíváme rozdílné barvy pro
jednotlivé vlastnosti ani pomocné vysvětlující texty.

Proficiency bonus, bonusy dovedností a bonusy záchranných hodů zůstávají
součástí plného MVP deníku, ale v první session jsou skryté, dokud je PJ
nezačne učit. Dítě označuje proficiency u skills/saves až v tomto pozdějším
kroku. Samotný hod provádí dítě a samo přičítá zobrazený bonus.

Ukládáme pouze aktuální hodnoty vlastností, ne jejich historii.

### Datový základ prvního řezu deníku

Tabulka `characters` zůstává hlavním záznamem postavy. Pro první řez se k
existujícím `id`, `user_id` a `name` přidají:

-   reference na portrét,
-   `race_code`,
-   `class_code`,
-   `level`,
-   `str`, `dex`, `con`, `int`, `wis`, `cha`.

`race_code`, `class_code`, `level` a šest vlastností mohou být `NULL`,
protože postava vzniká postupně. Level a vlastnosti používají rozsah
1--20, pokud nejsou prázdné. Přesná podoba reference na soubor portrétu
je implementační detail storage vrstvy.

------------------------------------------------------------------------

## 12. Iniciativa a pasivní vnímání

**Iniciativa:** aplikace automaticky zobrazuje bonus odvozený z DEX.
Dítě samo hodí k20 a bonus přičte.

Initiative tracker nemáme. Pořadí boje řeší PJ.

**Pasivní vnímání:** aplikace ho může automaticky dopočítat z již
známých údajů, pokud implementace zůstane jednoduchá. Pokud by výjimky
vyžadovaly výraznější rules engine, řešení se zjednoduší.

------------------------------------------------------------------------

## 13. HP, AC a rychlost

### HP

Postava má:

-   aktuální HP,
-   maximální HP,
-   dočasné HP.

Dítě může během hry zadat jednoduchou změnu například `-5` nebo `+3`;
aplikace provede aritmetiku.

Max HP aplikace automaticky neodvozuje z povolání/levelu.

Dočasné HP jsou méně vizuálně výrazné a dítě je mění ručně. Aplikace
automaticky neřeší pořadí absorpce zranění.

Hit Dice jsou **Později**.

### AC

AC je ručně zadané číslo.

Vedle něj existuje krátká **poznámka k AC**, například „kožená zbroj +
obratnost", aby dítě chápalo, odkud hodnota pochází.

Aplikace AC nepočítá z vybavení.

### Rychlost

Rychlost je ručně zapsaná hodnota, například `30 ft`.

Aplikace podle ní neomezuje token, nepočítá pole ani vzdálenost a nekontroluje pravidla
pohybu.

------------------------------------------------------------------------

## 14. Schopnosti a další znalosti

### Schopnosti

Jednoduchá sekce:

-   název schopnosti,
-   krátká vlastní poznámka.

Může jít o rasovou vlastnost, schopnost povolání nebo jinou relevantní
schopnost.

Žádná databáze schopností, automatické efekty ani usage counters.

> **Aplikace připomíná, co postava umí. Nemusí vědět, jak to funguje.**

### Poznámkové oblasti

Samostatná jednoduchá pole:

-   Jazyky,
-   Další odbornosti,
-   Odolnosti a další obrany,
-   Poznámky,
-   Příběhové pozadí.

Aplikace jejich obsah mechanicky neinterpretuje.

------------------------------------------------------------------------

## 15. Bojové položky

Zbraň nebo jiný útok má strukturu:

-   název,
-   -   na útok,
-   zranění/účinek,
-   typ zranění,
-   dosah/oblast,
-   krátká poznámka.

Attack bonus dítě zadává podle PJ/pravidel.

Vlastnosti zbraní typu lehká, obouruční, finesse apod. nejsou
strukturovaný systém; pokud jsou důležité, dítě je zapíše do poznámky.

Nevytváříme databázi zbraní, automatické útoky ani automatické damage.

------------------------------------------------------------------------

## 16. Kouzla

Kouzla jsou strukturovanější, protože jejich struktura má výukovou
hodnotu.

Položka kouzla obsahuje:

-   název,
-   úroveň kouzla,
-   sesílací čas,
-   dosah/oblast,
-   trvání,
-   koncentrace ano/ne,
-   komponenty,
-   způsob vyhodnocení,
-   účinek/zranění,
-   typ zranění,
-   krátká poznámka.

### Komponenty

Komponenty používají checkboxy:

-   V
-   S
-   M

Pokud je relevantní materiální komponenta, může být doplněn krátký text.

Aplikace komponenty mechanicky nekontroluje ani nespotřebovává.

### Vyhodnocení

Jednoduchá volba:

-   Bez hodu
-   Útok kouzlem
-   Záchranný hod

U záchranného hodu lze vybrat STR / DEX / CON / INT / WIS / CHA.

Aplikace nevyhodnocuje úspěch.

### Kouzelnická matematika

Postava může mít nastavenou sesílací vlastnost.

Aplikace z jejího modifikátoru a proficiency bonusu automaticky
vypočítá:

-   bonus k útoku kouzlem,
-   SO záchrany kouzla.

Automatizujeme výpočet čísla, nikoliv použití pravidla.

------------------------------------------------------------------------

## 17. Spell sloty

Spell sloty jsou jednoduchý stav **aktuální / maximum**.

Mohou být zobrazeny například:

`1. úroveň  ● ● ○ ○   2/4`

Dítě slot samo spotřebuje nebo vrátí.

Aplikace:

-   automaticky neodečítá slot při seslání,
-   automaticky neobnovuje sloty při odpočinku,
-   zatím automaticky neodvozuje maximum slotů z class/level.

Přípravu kouzel v MVP neřešíme.

Seznam kouzel znamená kouzla, která dítě aktuálně zná/používá.

------------------------------------------------------------------------

## 18. Inventář

Inventář je pasivní seznam:

-   název,
-   množství,
-   krátká poznámka.

Peníze jsou běžná položka inventáře.

Nevytváříme:

-   samostatný měnový systém,
-   váhu/nosnost,
-   equipped state,
-   automatickou vazbu inventář → AC,
-   automatickou vazbu inventář → útoky,
-   databázi předmětů.

------------------------------------------------------------------------

## 19. Conditions a další mechaniky

Samostatný systém stavových efektů není v MVP.

Pokud je postava například otrávená, dítě si stav může dočasně napsat do
Poznámek a PJ vysvětlí pravidlový význam.

Nemáme ikony stavů na tokenech ani automatické efekty.

Inspiration, death saves a Hit Dice jsou mimo MVP.

------------------------------------------------------------------------

## 20. Kostky

MVP obsahuje jednoduchou sadu:

-   k4
-   k6
-   k8
-   k10
-   k12
-   k20
-   k100

Kliknutí na kostku provede jeden čistý náhodný hod.

Výsledek se zobrazí ve společném krátkodobém logu, například:

`Eliška: k20 → 14`

Nevytváříme:

-   animace,
-   formule typu 2d6+3,
-   makra,
-   automatické modifikátory,
-   advantage/disadvantage switch,
-   attack buttons.

Když dítě potřebuje 2k6, hodí k6 dvakrát.

> **Kostky simulují fyzickou kostku. Nic víc.**

Dice log nemusí být dlouhodobě persistentní.

------------------------------------------------------------------------

## 21. Hlavní herní obrazovka

Během hraní dítě primárně vidí:

-   mapu,
-   tokeny,
-   jednoduché kostky,
-   otevíratelný kompaktní deník.

Dítě by kvůli běžnému hraní nemělo potřebovat opustit mapu.

Panel může umožnit rychle měnit běžný stav, zejména HP a spell sloty. XP
může zůstat v plném deníku.

------------------------------------------------------------------------

## 22. Mapy a čtvercová mřížka

Pro první session připravíme základní balík map předem přímo v projektu. Mapy se nepřidávají přes UI během hry. Preferovaný formát mapových assetů pro MVP je **WebP** kvůli menší velikosti souborů a rychlejšímu načítání. Upload nových map přes UI pro Vedoucího je **Později**.

Zdrojové mapy jsou bez gridu. Aplikace přes ně vytvoří vlastní čtvercovou mřížku.

PJ při přípravě nastaví velikost pole a vidí okamžitý náhled. Každé pole představuje 5 ft. Velikost pole je editovatelná číselným vstupem s live preview a validací. Pro aktuální MVP používáme povolený rozsah 20--300 px; meze mohou být později upraveny podle reálných map.

Velikost pole je vlastnost konkrétní mapy a je součástí sdíleného herního
stavu. Ukládá se serverově a všichni klienti používají stejnou hodnotu.
Platná změna velikosti pole se ostatním otevřeným klientům propíše v
realtime. V datovém modelu je konfigurace mapy reprezentována tabulkou `map_config`, kde stabilní textové `map_id` identifikuje mapu a `cell_size` ukládá velikost pole. Seznam map je pro MVP statický v kódu; databáze neobsahuje samostatnou knihovnu map.

Mřížka začíná v levém horním rohu mapového souřadnicového prostoru `(0,0)`.
Velikost pole je udaná v pixelech map-space. Na pravém a spodním okraji mohou
vzniknout neúplná pole; ta se mohou vizuálně zobrazit, ale nejsou platným
cílem pro snap tokenu.

V MVP nemáme:

-   grid offset,
-   rotaci gridu,
-   autodetekci,
-   measurement tools,
-   map drawing,
-   fog of war,
-   lights,
-   doors,
-   effects.

------------------------------------------------------------------------

## 23. Knihovna map a aktivní scéna

Vedoucí má jednoduchý seznam předem připravených map. Pro MVP stačí obyčejný dropdown; nevytváříme plnohodnotnou map library UI.

Hráči tento seznam nevidí a nemají dostávat názvy, náhledy ani data neaktivních map.

Vedoucí nastaví aktivní mapu a hráči jsou automaticky přepnuti v realtime. Aktivní mapa je uložená v singleton řádku `game_state.id = 1` jako `active_map_id`.

Mapové obrázky se nenačítají všechny dopředu. Klient načítá pouze aktuálně aktivní mapu; ostatní mapy se načtou až při přepnutí.

PJ řídí scénu. Hráč mapu nevybírá.

------------------------------------------------------------------------

## 24. Zoom a pan

Každý uživatel ovládá vlastní lokální zoom/pan.

Camera state se nesynchronizuje.

Mapa, čtvercová mřížka a tokeny musí být v jednom vizuálním/souřadnicovém
prostoru.

Důležitý acceptance test:

> Umístit token na pole → opakovaně změnit zoom a posun mapy → token
> zůstává přesně na stejném poli.

------------------------------------------------------------------------

## 25. Hráčské tokeny

Hráčský token používá portrét postavy.

Hráčský token logicky zabírá jedno pole. Je kruhový a jeho vizuální průměr je
90 % velikosti pole, aby kolem tokenu zůstala malá mezera a mřížka byla
čitelná. Uložené souřadnice `x/y` označují střed tokenu v map-space.

Vedoucí umisťuje hráčské tokeny na mapu.

Hráč může pohybovat pouze vlastním tokenem. Vedoucí může pohybovat
kterýmkoliv hráčským tokenem.

Pohyb:

1.  drag probíhá lokálně,
2.  po skutečném drag/dropu se střed tokenu snapne na střed nejbližšího
    platného úplného pole,
3.  výsledná pozice se synchronizuje ostatním.

Pouhý klik bez skutečného tažení pozici nemění. Při načtení aplikace se stará
nesnapnutá pozice automaticky nepřepočítává. Pokud je token puštěn nad
neúplnou částí gridu na pravém nebo spodním okraji, snapne se na nejbližší
platné úplné pole.

Nesynchronizujeme kontinuálně každý pixel pohybu.

Každá mapa si pamatuje poslední pozice tokenů.

Postava může na konkrétní mapě nemít žádnou pozici. Tento stav reprezentujeme **absencí řádku** v `token_positions` pro dvojici `character_id + map_id`; nepoužíváme `x = NULL` / `y = NULL`. To znamená, že postava není v dané scéně.

Pokud postava na aktivní mapě nemá pozici, Vedoucí může použít jednoduchou akci **„Přidat postavu na mapu“**. Aplikace vytvoří map-specific pozici na platném poli poblíž středu mapy a Vedoucí ji potom běžným drag/dropem přesune. Nevytváříme placement mode ani klikání do mapy pro výběr startovní pozice.

Vedoucí může token z mapy odebrat bez smazání účtu, postavy nebo deníku.

Token zůstává na mapě i při odpojení hráče. Nesledujeme online/offline
presence.

### Stabilní datový model map a hráčských tokenů

Pro MVP používáme tento základ:

- `characters`: `id uuid` jako primární klíč, `user_id uuid NULL`, `name text NOT NULL`,
- `characters.user_id` odkazuje na `auth.users.id`; při smazání účtu se použije `ON DELETE SET NULL`,
- jeden účet může mít více postav v čase,
- `map_config`: `map_id text` jako primární klíč a `cell_size int4`,
- `game_state`: singleton řádek `id = 1` s `active_map_id text`,
- `token_positions`: složený primární klíč `(character_id, map_id)`, souřadnice `x/y` typu `double precision`,
- `token_positions.character_id` odkazuje na `characters.id` s `ON DELETE CASCADE`,
- `token_positions.map_id` odkazuje na `map_config.map_id` s `ON DELETE CASCADE`.

`x/y` jsou map-space pixely a mohou být desetinné hodnoty. To umožňuje přesně uložit středy polí i při liché hodnotě `cell_size`.

------------------------------------------------------------------------

## 26. NPC tokeny

NPC jsou lokální pro konkrétní mapu.

NPC v MVP obsahuje pouze:

-   jméno,
-   volitelný obrázek,
-   pozici,
-   visible/hidden.

NPC může vzniknout bez obrázku; aplikace může zobrazit jednoduchý
placeholder se jménem nebo iniciálou.

Vedoucí NPC přidává, přesouvá a odstraňuje.

NPC nemá:

-   character sheet,
-   HP,
-   staty,
-   inventář,
-   schopnosti.

Nevytváříme globální NPC databázi. Pokud se stejné NPC objeví na jiné
mapě, PJ ho může vytvořit znovu.

Každá mapa si pamatuje svá NPC a jejich pozice.

### Visibility

NPC může být visible nebo hidden.

Vedoucí skryté NPC při přípravě vidí. Hráči ho nemají vidět/dostávat,
dokud není odhaleno.

Nevytváříme individuální visibility, stealth engine ani perception
engine.

Pokud bezpečná implementace hidden NPC výrazně zkomplikuje realtime nebo
permissions, je funkce kandidátem k odkladu.

### Velikost NPC

Různá velikost NPC tokenů je **Později**. V budoucnu může drak zabírat
vizuálně více prostoru než goblin, ale v MVP to neřešíme.

------------------------------------------------------------------------

## 27. Uživatelské chyby a stavové zprávy

MVP má od začátku používat srozumitelné chybové zprávy. Uživatel nemá vidět technické chyby Supabase nebo JavaScriptu.

Pravidla:

- chyba konkrétní akce se zobrazí co nejblíž místu, kde vznikla,
- globální zpráva se používá jen pro problém celé aplikace, mapy nebo připojení,
- zpráva stručně popíše, co se nepovedlo, a pokud možno řekne, co má uživatel udělat dál,
- technické detaily se zapisují do `console.error(...)`, ne do uživatelského UI,
- nevytváříme kvůli tomu obecný error framework ani externí toast knihovnu; stačí malý společný helper a jednoduché stavy `error`, `warning`, `info`.

Příklady uživatelských zpráv:

- „Mapu se nepodařilo načíst. Zkus stránku obnovit.“
- „Postavu se nepodařilo přidat na mapu. Zkus to znovu.“
- „Pozici se nepodařilo uložit. Token může být po obnovení na předchozím místě.“
- „Spojení se hrou bylo přerušeno. Zkouším se znovu připojit.“

------------------------------------------------------------------------

## 28. Persistence a realtime

Po reloadu nebo reconnectu musí zůstat důležitý stav:

-   postava a deník,
-   HP a zdroje,
-   XP,
-   inventář,
-   útoky,
-   kouzla,
-   aktivní mapa,
-   map-specific konfigurace mřížky včetně velikosti pole,
-   map-specific pozice tokenů,
-   NPC a jejich potřebný stav.

Ukládáme aktuální stav, nikoliv zbytečnou historii.

Nepotřebujeme:

-   historii pohybu tokenů,
-   dlouhodobou historii hodů.

Realtime používáme pro společný herní stav, ne pro presence uživatelů.

------------------------------------------------------------------------

## 29. Autosave

Deník používá jednoduchý autosave.

Uživatel může vidět nenápadné stavy:

-   Ukládám...
-   Uloženo
-   Nepodařilo se uložit

Nevytváříme version history, collaborative editor, Google Docs behavior
ani komplexní undo.

Implementace nemá bezdůvodně posílat request po každém stisku klávesy;
použije se jednoduché rozumné ukládání/debounce.

V prvním výukovém řezu se pole Studentského průkazu a vlastností ukládají
po opuštění konkrétního pole. Neplatná hodnota se neukládá.

------------------------------------------------------------------------

## 30. MVP

MVP zahrnuje:

**Pořadí implementace deníku pro první session:** nejprve Studentský průkaz + šest
vlastností + automatické modifikátory. Ostatní části deníku se přidávají podle
výuky a reálné potřeby; nejde o progression engine.

1.  jednoduché přihlášení předem vytvořených účtů,
2.  dvě role Hráč / Vedoucí,
3.  domovskou stránku Můj deník / Vstoupit do hry,
4.  jednoduchý seznam hráčů pro Vedoucího,
5.  jeden účet = jedno dítě; účet může mít více postav v čase,
6.  plný deník se sekcemi viditelnými od začátku,
7.  portrét = token,
8.  read-only přístup Vedoucího k deníkům hráčů,
9.  autosave,
10. základní D&D 2014 pole,
11. rasa/povolání/zázemí bez character-builder automatiky,
12. vlastnosti a automatické modifikátory,
13. proficiency bonus,
14. skills/saves + jednoduché automatické bonusy,
15. initiative bonus,
16. jednoduché passive perception,
17. HP current/max + jednoduché +/-,
18. temporary HP,
19. ruční AC + poznámka,
20. rychlost,
21. schopnosti jako název + poznámka,
22. jazyky, odbornosti a obrany jako jednoduchá pole,
23. XP + level a jednoduchý threshold hint; změna levelu zůstává ruční,
24. ručně zadávané bojové položky,
25. strukturovaná kouzla,
26. spell attack bonus a spell save DC jako rutinní matematika,
27. spell sloty jako aktuální/maximum,
28. jednoduchý inventář,
29. Příběhové pozadí + Poznámky,
30. plný deník + kompaktní mapový panel nad stejnými daty,
31. mapa + tokeny + kostky + panel deníku,
32. předem připravený balík WebP map v projektu; upload přes UI je Později,
33. generovaná čtvercová mřížka a nastavení velikosti pole,
34. lokální zoom/pan,
35. knihovna připravených map pouze pro Vedoucího,
36. jedna aktivní mapa a realtime přepnutí hráčů,
37. hráčské tokeny s map-specific pozicemi a akcí Přidat postavu na mapu,
38. drag/drop + snap na pole + synchronizace po dropu,
39. NPC tokeny lokální pro mapu,
40. srozumitelné kontextové chybové zprávy; technické detaily pouze do konzole,
40. NPC bez obrázku s jednoduchým placeholderem,
41. NPC visible/hidden, pokud nezkomplikuje MVP,
42. jednoduché kostky,
43. krátkodobý společný roll log,
44. persistence důležitého stavu a reconnect.

------------------------------------------------------------------------

## 31. Výslovně mimo MVP

Toto je obranná zeď proti scope creepu:

-   fog of war,
-   chat,
-   audio/video,
-   animované kostky,
-   combat engine,
-   initiative tracker,
-   automatické útoky,
-   automatické damage,
-   automatické odvozování attack bonusu z vybavení,
-   movement validation,
-   distance measurement,
-   map drawing,
-   lights,
-   doors,
-   efekty,
-   složité mapové vrstvy,
-   komplexní NPC sheets,
-   globální NPC databáze,
-   quest manager,
-   item database,
-   bestiary,
-   plná spell database,
-   komplexní permissions,
-   třetí role,
-   self-registration,
-   uživatelský dashboard,
-   více kampaní,
-   automatické rests,
-   conditions systém,
-   inspiration,
-   death saves,
-   Hit Dice,
-   level-up wizard,
-   movement history,
-   dlouhodobá dice history,
-   continuous realtime drag,
-   online/offline presence,
-   grid offset/rotation/detection,
-   univerzální RPG engine,
-   subraces,
-   feats,
-   alignment,
-   systém víry/božstva,
-   personality systém,
-   spell preparation,
-   různé velikosti NPC tokenů.

------------------------------------------------------------------------

## 32. Definice úspěchu

První verze je úspěšná, pokud:

-   dítě se jednoduše přihlásí,
-   najde svůj deník a chápe, kam postupně zapisovat informace,
-   vstoupí do hry,
-   vidí pouze aktuální mapu,
-   vidí ostatní postavy a viditelná NPC,
-   pohybuje vlastním tokenem,
-   může otevřít deník bez opuštění mapy,
-   používá jednoduché kostky,
-   mění HP, spell sloty a další běžný stav,
-   Vedoucí dokáže měnit scénu,
-   Vedoucí dokáže rozmísťovat hráče a NPC,
-   důležité změny se synchronizují bez reloadu,
-   reload/reconnect nezničí důležitá data.

Nejdůležitější kritérium:

> **Během hry děti řeší D&D a příběh, ne webovou aplikaci.**

------------------------------------------------------------------------

## 33. Rizika

### Kritické

**Realtime synchronizace**\
Musí být ověřena velmi brzy na minimálně dvou skutečných klientech.

**Deadline 20 dní**\
Plánujeme přibližně 4 h/den. Rezerva se nepoužívá k rozšiřování scope.

### Vysoké

**Scope creep**\
Jednotlivé „malé" VTT funkce mohou dohromady vytvořit nový Foundry.

**Deník → character builder / rules engine**\
Struktura a jednoduchá matematika ano; automatizace pravidel ne.

**AI/Codex overengineering**\
Malé tickety, minimum abstrakcí a závislostí, pochopitelný kód.

### Střední

**Velké mapy/AI obrázky**\
Mohou ovlivnit načítání a výkon. Pro MVP používáme WebP a načítáme pouze aktivní mapu; nepreloadujeme celý balík.

**Persistence vs. realtime**\
Je nutné jasně oddělit trvalý stav od krátkodobých událostí.

**Hidden NPC a inactive maps**\
Spoiler data nemají být pouze schovaná v UI; hráči je nemají dostávat.

**Autosave**\
Musí být spolehlivý, ale jednoduchý.

------------------------------------------------------------------------

## 34. Roadmapa prvních 20 dní

### Dny 1--3 --- Technický spike

-   repo,
-   minimální frontend,
-   deployment,
-   backend/realtime,
-   jedna mapa,
-   jeden token,
-   dva klienti.

**GO/NO-GO:** Klient A přesune token a klient B změnu uvidí.

Pokud ne, řešíme architekturu/realtime, nikoliv CSS.

### Dny 4--7 --- Mapa

-   WebP mapa,
-   čtvercová mřížka,
-   nastavení velikosti pole,
-   zoom/pan,
-   tokeny,
-   drag/snap,
-   realtime,
-   map-specific pozice,
-   více předem připravených map,
-   aktivní mapa a lazy načítání pouze aktivního mapového assetu,
-   přidání postavy na aktivní mapu.

### Dny 8--11 --- Deník

Nejdřív dokončit a ověřit první výukový řez:

-   Studentský průkaz: portrét, jméno, rasa, povolání, level,
-   šest vlastností včetně validace a automatických modifikátorů,
-   ukládání/autosave a srozumitelné chyby.

Teprve potom podle dostupného času a pořadí výuky pokračovat dalšími částmi
plného MVP deníku: skills/saves, HP/AC, XP, schopnosti, bojové položky,
kouzla, spell sloty, inventář a poznámková pole.

### Dny 12--14 --- Herní obrazovka a integrace

-   mapový panel deníku,
-   kostky,
-   roll log,
-   NPC,
-   visibility podle dosažitelné složitosti,
-   role/oprávnění.

### Dny 15--17 --- Integrační testování

Testovat více browserů, účtů a ideálně zařízení:

-   současný pohyb,
-   změna aktivní mapy,
-   reload,
-   reconnect,
-   editace deníku,
-   současné hody,
-   NPC,
-   oprávnění a spoiler data.

### Dny 18--19 --- Feature freeze

Žádné nové funkce.

Pořadí oprav:

1.  Critical
2.  Functional
3.  UX
4.  Cosmetic

### Den 20 --- Release candidate

-   smoke test,
-   reálné účty,
-   reálné mapy,
-   reálné postavy/NPC,
-   kontrola persistence,
-   kontrola realtime,
-   příprava první session.

Pokud jsme pozadu, **škrtáme funkce; nezvětšujeme scope**.

------------------------------------------------------------------------

## 35. Prioritizační model

### MVP

Bez toho první použitelná verze nedává smysl nebo zásadně selže při
hraní.

### Důležité

Vysoká hodnota, ale první session může proběhnout bez toho.

### Později

Řešit až podle zkušeností ze skutečného hraní.

Aktuálně sem patří například:

-   Hit Dice,
-   různé velikosti NPC tokenů,
-   další pohodlné funkce potvrzené reálnou potřebou.

### Budoucnost

Nyní neřešit.

Patří sem zejména funkce směřující k plnohodnotnému VTT, komplexní
automatizaci pravidel nebo rozšiřování produktu mimo aktuální kampaň.

------------------------------------------------------------------------

## 36. Pravidlo pro změnu scope

Každý nový požadavek musí odpovědět:

1.  Jaký konkrétní problém řeší?
2.  Kdo tento problém má?
3.  Jak často nastává?
4.  Co se stane, když ho před první session nevyřešíme?
5.  Jaké je nejmenší možné řešení?
6.  Pomáhá dítěti hrát/učit se D&D, nebo znovu vyrábíme Foundry?

Pokud funkce není potřebná pro první session, standardní výsledek je
**Později**.

------------------------------------------------------------------------

## 37. Otevřená rozhodnutí

Následující věci zatím nejsou definitivně uzavřené a mají se řešit až ve
chvíli, kdy jsou potřeba:

-   přesná informační architektura záložek kompaktního deníku,
-   finální pravidla RLS/oprávnění po napojení autentizace,
-   technické řešení uploadu/omezení portrétu postavy; UX je jednoduchý klik na portrét bez cropperu,
-   rozsah class-specific částí deníku,
-   zda hidden NPC zůstane v MVP po technickém spike,
-   detaily jednoduché pomůcky pro generování hodnot vlastností.

Neřešit je předčasně jen kvůli „kompletnímu návrhu".


------------------------------------------------------------------------

### Změny ve verzi 1.0.4

- uzavřen první výukový řez deníku: Studentský průkaz + šest vlastností,
- první session schovává pokročilejší mechaniky, dokud je PJ nezačne učit,
- Studentský průkaz je běžně read-only a edituje se přes jednu ikonu tužky,
- portrét/token je kruhový; bez cropperu a ručního posunu v MVP,
- rasa a povolání používají pevné seznamy a stabilní systémové kódy,
- drakorozený není v této kampani povolen; podrasy/varianty a multiclass nejsou MVP,
- vlastnosti mohou být prázdné, používají rozsah 1--20 a modifikátory se pouze dopočítávají,
- první sheet se má vejít na běžný notebook bez scrollování,
- rozšířen minimální datový základ `characters` pro první řez deníku,
- opraven starší rozpor: jeden účet může mít více postav v čase.

------------------------------------------------------------------------

### Změny ve verzi 1.0.3

- mapové assety pro MVP jsou předem připravené v projektu a preferují WebP,
- klient načítá pouze aktivní mapu; upload map přes UI je Později,
- jeden účet může mít více postav v čase,
- hráčský token používá stejné `character_id` jako postava,
- uzavřen stabilní základ `characters`, `map_config`, `game_state`, `token_positions`,
- absence `token_positions` znamená, že postava na mapě není,
- přidání postavy na aktivní mapu je MVP,
- zavedené MVP UX pravidlo pro srozumitelné chybové a stavové zprávy.

------------------------------------------------------------------------

## 38. Zlatá pravidla projektu

1.  **Dítě nemá ovládat VTT. Má hrát D&D.**
2.  **Aplikace nabízí. PJ instruuje. Dítě provádí.**
3.  **Automatizujeme rutinní matematiku, ne hraní.**
4.  **Jednu informaci zadáváme pokud možno pouze jednou.**
5.  **Strukturu poskytuje aplikace. Obsah dodává PJ a zapisuje hráč.**
6.  **Deník není character builder ani rules engine.**
7.  **Web = mechanická podpora; papír = příběh, lore a vlastní
    poznámky.**
8.  **Neimplementujeme mechaniku jen proto, že existuje v D&D.**
9.  **Kostky simulují fyzickou kostku. Nic víc.**
10. **PJ řídí scénu. Hráč řídí svou postavu.**
11. **Synchronizujeme herní stav, ne stav uživatelů.**
12. **Ukládáme aktuální stav, ne zbytečnou historii.**
13. **AI/Codex implementuje naše rozhodnutí; nerozhoduje za nás scope.**
14. **Funkční a jednoduché řešení má přednost před dokonalým.**
15. **Za 20 dní potřebujeme hratelnou aplikaci, ne hotovou platformu.**

------------------------------------------------------------------------

## 39. Jak tento dokument používat

Tento dokument je hlavní produktový zdroj pravdy pro projekt.

Při novém rozhodnutí:

-   nejprve zkontrolovat, zda už zde není vyřešeno,
-   pokud nový požadavek odporuje briefu, konflikt pojmenovat,
-   rozhodnout, zda jde o vědomou změnu scope,
-   významná schválená rozhodnutí do briefu doplnit,
-   staré rozhodnutí nepřepisovat bez vědomého rozhodnutí.

Implementační detaily a jednotlivé Codex tickety mají být vedeny
odděleně. PROJECT_BRIEF nemá postupně bobtnat do technické dokumentace
celé aplikace.
