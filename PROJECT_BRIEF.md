# PROJECT BRIEF --- Webová aplikace pro dětské D&D

**Verze:** 1.1.3  
**Stav dokumentu:** aktualizovaný scope a přijatá rozhodnutí pro MVP\
**Pravidlový základ:** D&D 5e (2014)\
**Cílová skupina:** přibližně 10 uživatelů\
**Deadline první hratelné verze:** přibližně 20 dní od zahájení vývoje

### Změny ve verzi 1.1.3

- zpřesněna informační architektura hráčského `game.html`,
- ve viditelném UI již nepoužíváme označení „deník“; používáme `Studentský průkaz` a `Studijní panel`,
- jméno postavy v horní liště slouží jako ovladač Studijního panelu,
- kostky mají samostatný ovladač s ikonou kostky vedle jména postavy,
- Studijní panel a panel Kostky používají stejný pravý prostor a jsou vzájemně výlučné,
- Studijní panel obsahuje záložky `Přehled` a `Vlastnosti`,
- panel Kostky obsahuje kostky, poslední hod a společný realtime roll log,
- každý záznam roll logu obsahuje jméno postavy, typ kostky a výsledek,
- spodní herní lišta s kostkami se nepoužívá.

### Změny ve verzi 1.1.2

- globální vizuální směr aplikace je **akademický atlas / školní registr magické akademie**,
- schválený návrh akademie „Academia Magna Illistrass“ slouží jako vizuální reference pro barevnost, typografický charakter, rámečky, dělení panelů a heraldické akcenty,
- styl se aplikuje postupně: nejdřív `character.html`, potom `index.html`, nakonec okolní UI `game.html`,
- samotný map-space a mapová logika se kvůli vizuálnímu sjednocení nemění,
- zachován scope guard: atmosféra ano, těžké textury, ornamentální přeplácanost a nové frameworky ne.

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
-   aktuální pracovní kandidát: Supabase,
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

> **1 účet = 1 dítě. Jeden účet může mít více postav.**

Každá postava má vlastní deník a vlastní hráčský token.

Přesný způsob výběru aktivní postavy / přepínání mezi více postavami není
zatím uzavřen. Současný flow přes `character_id` zůstává do dalšího
produktového rozhodnutí beze změny.

Hráč může číst a upravovat pouze deníky svých postav. Vedoucí může číst deníky
všech hráčských postav, ale v MVP je neupravuje.

------------------------------------------------------------------------

## 5. Základní uživatelský flow

Po přihlášení hráč uvidí jednoduchou domovskou stránku se dvěma hlavními
akcemi:

-   **Můj deník**
-   **Vstoupit do hry**

Aktuální hlavní stránky:

-   `index.html` — homepage / rozcestník,
-   `character.html` — Deník postavy,
-   `game.html` — herní/mapová stránka.

Navigace zachovává `character_id` v URL. Z `character.html` i `game.html`
vede jednoduchý návrat `← Domů`.

Toto flow bylo ručně UX ověřeno s Vypravěčem a bez konkrétního důvodu se
nemění.

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

## 7. Studentský průkaz a Studijní panel

Ve viditelném UI nepoužíváme označení „deník“.

Používáme:

1.  **Studentský průkaz** — plný pohled na postavu pro správu a učení.
2.  **Studijní panel** — kompaktní pohled během hry.

Oba pohledy používají stejná data. Nevytváříme dvě kopie dat ani
samostatné výpočty pro herní panel.

### Listování Studentským průkazem

Studentský průkaz má být do budoucna možné jednoduše „listovat“ pomocí
záložek. Záložky patří **dovnitř Studentského průkazu**, nejsou novou
hlavní navigací aplikace.

Implementace má zůstat jednoduchá:

-   běžné HTML/CSS + malý vanilla JS stav aktivní záložky,
-   žádný router,
-   žádný framework,
-   žádná persistence aktivní záložky,
-   žádná databázová logika kvůli listování.

Neimplementujeme prázdné budoucí stránky jen proto, že mohou jednou
existovat. Další stránka vznikne až pro konkrétní obsah.

### Studijní panel na herní obrazovce

Studijní panel je pravý postranní panel na `game.html`.

Aktuální MVP obsahuje záložky:

-   `Přehled`,
-   `Vlastnosti`.

`Přehled` obsahuje aktuálně zejména HP.
`Vlastnosti` obsahují šest vlastností, jejich hodnotu, modifikátor
a záchranný hod.

Každá další informace ve Studijním panelu musí odpovědět na otázku:
**potřebuje ji dítě běžně během session?**

Jméno aktuální postavy v horní liště funguje jako ovladač
otevření/zavření Studijního panelu.

Panel je po načtení stránky zavřený.
Otevření panelu nepřekrývá mapu; mapa se pouze responsivně přizpůsobí
menší dostupné ploše.
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

Základní identita postavy:

-   portrét/token,
-   jméno,
-   rasa,
-   povolání,
-   zázemí,
-   level,
-   XP.

V aktuálním prvním výukovém řezu je ve Studentském průkazu stále
viditelné také **HP (aktuální / maximum)**.

Portrét postavy je zároveň obrázkem hráčského tokenu.

Hráč může vlastní obrázek změnit, pokud implementace zůstane jednoduchá.
Nevytváříme editor avatarů, cropper ani složité zpracování obrázků.

### XP

-   ukládá se celkové XP,
-   `NULL` je platný stav,
-   XP je nezáporné číslo,
-   aplikace může zobrazit jednoduchou informaci, kolik XP zbývá do další
    úrovně,
-   používají se standardní D&D 5e 2014 XP thresholds,
-   level se nikdy nezvyšuje automaticky,
-   pokud je XP dost na další level, stačí jednoduchá informace typu
    „Máš dost XP na další úroveň.“,
-   nevytváříme level-up wizard.

### UX Studentského průkazu

Read-only režim má být kompaktní, přehledný a primárně prezentační.
Editace probíhá přes jednoduchou tužku; formulářový vzhled se nemá
zbytečně propisovat do read-only stavu.

Studentský průkaz má být vizuálně hlavním objektem horní části deníku a
jeho struktura má počítat s budoucím jednoduchým listováním.

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

Rasa, povolání a zázemí jsou samostatná pole. Dítě je vyplňuje ve
chvíli, kdy k nim příběh/PJ dojde.

Princip:

> **Dítě vybere → aplikace stručně poradí → dítě samo zapíše mechanické
> změny.**

Aplikace automaticky neaplikuje mechanické důsledky rasy, povolání nebo
zázemí.

Podrasy/varianty jsou mimo MVP. Featy jsou Budoucnost.

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

Dítě zadává hodnoty vlastností samo. Aktuální editace používá validaci
`1–20`, autosave na blur a při neplatné hodnotě návrat k poslední platné
hodnotě.

Aplikace automaticky vypočítá:

-   modifikátory vlastností,
-   proficiency bonus podle levelu,
-   bonusy dovedností,
-   bonusy záchranných hodů.

Dítě označuje proficiency u skills/saves.

Samotný hod provádí dítě a samo přičítá zobrazený bonus.

### Prezentační model vlastnosti

Každá vlastnost má v read-only režimu zobrazovat:

-   jednoduchý rozpoznávací **symbol vedle názvu**,
-   název + zkratku,
-   hlavní hodnotu vlastnosti,
-   **Modifikátor** s textovým popisem,
-   **Záchranný hod** s textovým popisem.

Symboly jsou orientační pomůcka, ne samostatná herní mechanika. Všech
šest vlastností zůstává vizuálně rovnocenných.

V read-only režimu nemá hodnota vypadat jako editovatelný input. Input
se objeví až v edit režimu.

Cílový desktopový layout prvního řezu zůstává `3 × 2` a spolu se
Studentským průkazem má být na běžném notebooku viditelný bez zbytečného
vertikálního scrollu.

Způsob vizuálního označení proficiency u záchranného hodu zatím není
definitivně uzavřen.

------------------------------------------------------------------------

## 12. Iniciativa a pasivní vnímání

**Iniciativa:** aplikace automaticky zobrazuje bonus odvozený z DEX.
Dítě samo hodí k20 a bonus přičte.

Initiative tracker v MVP nemáme. Pořadí boje řeší PJ.

**Initiative tracker je Později.** Pravděpodobná potřeba vznikne až ve chvíli,
kdy naroste počet útočících NPC a ruční správa pořadí začne být pro PJ
nepraktická.

**Pasivní vnímání:** aplikace ho může automaticky dopočítat z již
známých údajů, pokud implementace zůstane jednoduchá. Pokud by výjimky
vyžadovaly výraznější rules engine, řešení se zjednoduší.

------------------------------------------------------------------------

## 13. HP, AC a rychlost

### HP

Aktuální MVP používá:

-   `current_hp`,
-   `max_hp`.

**Temporary HP je Později.**

Běžná změna HP probíhá přímo v read-only režimu jednoduchým ovládáním
typu:

`[ - ] [ hodnota změny ] [ + ]`

Pravidla:

-   current HP se drží v rozsahu `0..max_hp`,
-   při snížení max HP pod current HP se current HP automaticky sníží na
    nové maximum,
-   pokud `max_hp = NULL`, rychlé změny HP jsou blokované,
-   pokud `current_hp = NULL`, rychlé změny HP jsou blokované,
-   max HP a případná inicializace current HP se řeší v edit mode,
-   případ snížení maxima pod current se zapisuje atomicky.

Max HP aplikace automaticky neodvozuje z povolání/levelu.

Hit Dice jsou **Později**.

### AC

AC je ručně zadané číslo.

Vedle něj existuje krátká **poznámka k AC**, například „kožená zbroj +
obratnost“, aby dítě chápalo, odkud hodnota pochází.

Aplikace AC nepočítá z vybavení.

### Rychlost

Rychlost je ručně zapsaná hodnota, například `30 ft`.

Aplikace podle ní neomezuje token, nepočítá pole ani vzdálenost a
nekontroluje pravidla pohybu.

------------------------------------------------------------------------

## 14. Doplňující info — studijní vysvětlení pravidel

Deník obsahuje jednu společnou **info ikonu / vstup do Doplňujícího
infa**.

Nejde o tooltipy u každého jednotlivého pole ani o tutorial systém.
Jde o jednoduchý společný studijní prostor, který připomíná „sešit s
pravidly“.

Obsah se doplňuje ručně podle toho, co se děti během skutečných session
stihly naučit. Nevíme dopředu, jak rychle budou jednotlivá témata
probrána, proto nevytváříme automatický výukový plán.

Doplňující info:

-   je stejné pro všechny děti,
-   neobsahuje lore ani příběhové spoilery,
-   vysvětluje skutečnou mechaniku D&D 5e 2014,
-   stručně popisuje **jak se číslo/pravidlo počítá, proč, z čeho vzniká a
    co ovlivňuje**,
-   může obsahovat krátký konkrétní příklad,
-   doplňuje vysvětlení PJ a pomáhá dítěti pravidlo později znovu
    pochopit a zapamatovat si ho.

Příklad témat: modifikátor vlastnosti, zdatnost, záchranný hod nebo jiné
mechaniky, které už byly ve hře skutečně vysvětlené.

Implementace má být záměrně jednoduchá:

-   obsah se upravuje přímo ve zdrojovém obsahu aplikace,
-   žádný editor pro PJ,
-   žádná databáze lekcí,
-   žádné individuální odemykání,
-   žádné sledování přečtení,
-   žádný progression systém,
-   žádné automatické rozhodování, co se má dítě učit.

------------------------------------------------------------------------

## 15. Schopnosti a další znalosti

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

## 16. Bojové položky

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

## 17. Kouzla

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

## 18. Spell sloty

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

## 19. Inventář

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

## 20. Conditions a další mechaniky

Samostatný systém stavových efektů není v MVP.

Pokud je postava například otrávená, dítě si stav může dočasně napsat do
Poznámek a PJ vysvětlí pravidlový význam.

Nemáme ikony stavů na tokenech ani automatické efekty.

Inspiration, death saves a Hit Dice jsou mimo MVP.

------------------------------------------------------------------------

## 21. Kostky

MVP obsahuje jednoduchou sadu:

-   k4
-   k6
-   k8
-   k10
-   k12
-   k20
-   k100

Kliknutí na kostku provede jeden čistý náhodný hod.

Kostky mají na herní obrazovce vlastní samostatný pravý panel.
Panel Kostky se otevírá ikonou kostky v horní liště vedle jména postavy.

Studijní panel a panel Kostky používají stejný pravý prostor a jsou
vzájemně výlučné. Otevřený může být vždy maximálně jeden z nich.

Panel Kostky obsahuje:

-   k4, k6, k8, k10, k12, k20 a k100,
-   výrazný poslední hod,
-   společný realtime roll log.

Poslední hod i každý záznam roll logu obsahují:

`<jméno postavy> · <kostka> → <výsledek>`

například:

`Eliška · k20 → 14`

Jméno je jméno postavy, nikoli jméno uživatelského účtu.

Roll log je krátkodobý společný herní stav.
V MVP zobrazujeme omezený počet posledních hodů, aktuálně maximálně 10.

Nevytváříme:

-   animace,
-   formule typu 2d6+3,
-   makra,
-   automatické modifikátory,
-   advantage/disadvantage switch,
-   attack buttons,
-   dlouhodobou historii celé session,
-   statistiky hodů,
-   filtry,
-   audit log.

Když dítě potřebuje 2k6, hodí k6 dvakrát.

> **Kostky simulují fyzickou kostku. Nic víc.**

Dice log nemusí být dlouhodobě persistentní.
------------------------------------------------------------------------

## 22. Hlavní herní obrazovka

Během hraní dítě primárně vidí:

-   mapu,
-   tokeny,
-   tenkou horní lištu,
-   podle potřeby jeden pravý postranní panel.

Mapa zůstává hlavním obsahem obrazovky.

Horní lišta obsahuje:

-   `← Domů`,
-   `Aktivní mapa: <název>`,
-   jméno aktuální postavy,
-   ikonu kostky.

Jméno postavy otevírá/zavírá **Studijní panel**.

Ikona kostky otevírá/zavírá **panel Kostky**.

Studijní panel a panel Kostky jsou vzájemně výlučné.
Nikdy nejsou otevřené současně.

Oba používají stejný pravý layoutový prostor a nepřekrývají mapu.
Při otevření, zavření nebo přepnutí panelu se mapa pouze responsivně
refitne do aktuálně dostupné plochy.

Studijní panel obsahuje:

-   `Přehled`,
-   `Vlastnosti`.

Panel Kostky obsahuje:

-   jednoduché kostky,
-   poslední hod,
-   společný krátkodobý roll log.

Dítě by kvůli běžnému hraní nemělo potřebovat opustit mapovou stránku.

XP a další méně často používané informace mohou zůstat pouze
ve Studentském průkazu.
------------------------------------------------------------------------

## 23. Mapy a čtvercová mřížka

PJ může předem nahrát mapy, pravděpodobně PNG.

Zdrojové mapy jsou bez gridu. Aplikace přes ně vytvoří vlastní čtvercovou mřížku.

PJ při přípravě nastaví velikost pole a vidí okamžitý náhled. Každé pole
představuje 5 ft. Jakmile se mapa používá, velikost gridu už neměníme.

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

## 24. Knihovna map a aktivní scéna

Vedoucí má seznam připravených map.

Hráči tento seznam nevidí a nemají dostávat názvy, náhledy ani data
neaktivních map.

Vedoucí nastaví aktivní mapu a hráči jsou automaticky přepnuti v
realtime.

PJ řídí scénu. Hráč mapu nevybírá.

------------------------------------------------------------------------

## 25. Zoom a pan

Aktuální MVP nepoužívá ruční zoom ani pan mapy.

Hotový směr je **responsivní fit mapy do dostupného viewportu**:

-   celá mapa se vejde do dostupné plochy bez scrollbarů,
-   zachovává poměr stran,
-   nezvětšuje se nad 100 %,
-   mapa, grid a tokeny se škálují společně,
-   škálovaný map-space je ve viewportu vycentrovaný horizontálně i
    vertikálně.

Interní map-space zůstává v původních pixelech mapy. Uložené `x/y`
znamenají střed tokenu v map-space. Resize mění pouze vizuální scale a
nesmí přepisovat uložené souřadnice.

Jakákoli FE změna, která by vyžadovala zásah do map-space, drag
matematiky, snapu, persistence nebo realtime, se nejdřív samostatně
posoudí.

**Později:**

-   ruční zoom,
-   pan celé mapy,
-   pinch zoom,
-   fullscreen,
-   další map controls.

------------------------------------------------------------------------

## 26. Hráčské tokeny

Hráčský token používá portrét postavy.

Vedoucí umisťuje hráčské tokeny na mapu.

Hráč může pohybovat pouze vlastním tokenem. Vedoucí může pohybovat
kterýmkoliv hráčským tokenem.

Pohyb:

1.  drag probíhá lokálně,
2.  po puštění se token snapne na nejbližší pole,
3.  výsledná pozice se synchronizuje ostatním.

Nesynchronizujeme kontinuálně každý pixel pohybu.

Každá mapa si pamatuje poslední pozice tokenů.

Postava může na konkrétní mapě nemít žádnou pozici. To znamená, že není
v dané scéně.

Vedoucí může token z mapy odebrat bez smazání účtu, postavy nebo deníku.

Token zůstává na mapě i při odpojení hráče. Nesledujeme online/offline
presence.

------------------------------------------------------------------------

## 27. NPC tokeny

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

V aktuálním MVP nevytváříme globální / znovupoužitelnou NPC databázi.
Pokud se stejné NPC objeví na jiné mapě, PJ ho zatím může vytvořit znovu.

**Globální / znovupoužitelná databáze NPC je Později.** Dává smysl až ve
chvíli, kdy začne růst počet opakovaně používaných NPC a ruční vytváření
začne být reálnou zátěží.

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

## 28. Persistence a realtime

Po reloadu nebo reconnectu musí zůstat důležitý stav:

-   postava a deník,
-   HP a zdroje,
-   XP,
-   inventář,
-   útoky,
-   kouzla,
-   aktivní mapa,
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

------------------------------------------------------------------------

## 30. MVP

MVP zahrnuje:

1.  jednoduché přihlášení předem vytvořených účtů,
2.  dvě role Hráč / Vedoucí,
3.  domovskou stránku Můj deník / Vstoupit do hry,
4.  jednoduchý seznam hráčů pro Vedoucího,
5.  jeden účet může mít více postav; každá postava má vlastní deník a token,
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
18. ruční AC + poznámka,
19. rychlost,
20. schopnosti jako název + poznámka,
21. jazyky, odbornosti a obrany jako jednoduchá pole,
22. XP + level a jednoduchý threshold hint; změna levelu zůstává ruční,
23. společné Doplňující info s ručně doplňovaným vysvětlením již probraných D&D pravidel,
24. ručně zadávané bojové položky,
25. strukturovaná kouzla,
26. spell attack bonus a spell save DC jako rutinní matematika,
27. spell sloty jako aktuální/maximum,
28. jednoduchý inventář,
29. Příběhové pozadí + Poznámky,
30. plný deník + kompaktní mapový panel nad stejnými daty,
31. mapa + tokeny + kostky + panel deníku,
32. upload/příprava map Vedoucím,
33. generovaná čtvercová mřížka a nastavení velikosti pole,
34. knihovna připravených map pouze pro Vedoucího,
35. jedna aktivní mapa a realtime přepnutí hráčů,
36. hráčské tokeny s map-specific pozicemi,
37. drag/drop + snap na pole + synchronizace po dropu,
38. NPC tokeny lokální pro mapu,
39. NPC bez obrázku s jednoduchým placeholderem,
40. NPC visible/hidden, pokud nezkomplikuje MVP,
41. jednoduché kostky,
42. krátkodobý společný roll log,
43. persistence důležitého stavu a reconnect.
------------------------------------------------------------------------

## 31. Výslovně mimo MVP

Toto je obranná zeď proti scope creepu:

-   fog of war,
-   chat,
-   audio/video,
-   animované kostky,
-   combat engine,
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
-   initiative tracker,
-   globální / znovupoužitelná databáze NPC,
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
-   najde deník své zvolené postavy a chápe, kam postupně zapisovat informace,
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
Mohou ovlivnit načítání a výkon.

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

-   PNG mapa,
-   čtvercová mřížka,
-   nastavení velikosti pole,
-   zoom/pan,
-   tokeny,
-   drag/snap,
-   realtime,
-   map-specific pozice,
-   více map,
-   aktivní mapa.

### Dny 8--11 --- Deník

-   identita,
-   atributy,
-   skills/saves,
-   HP/AC,
-   XP/level,
-   schopnosti,
-   bojové položky,
-   kouzla,
-   spell sloty,
-   inventář,
-   poznámková pole,
-   ukládání/autosave.

### Dny 12--14 --- Herní obrazovka a integrace

-   Studijní panel na mapě,
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
-   temporary HP,
-   ruční zoom/pan, pinch zoom a fullscreen mapy,
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
-   finální technické řešení backendu/realtime (Supabase je pracovní
    kandidát),
-   přesný datový model,
-   přesná implementace souřadnic čtvercové mřížky a snapu,
-   konkrétní způsob uploadu/omezení obrázků,
-   rozsah class-specific částí deníku,
-   zda hidden NPC zůstane v MVP po technickém spike,
-   detaily jednoduché pomůcky pro generování hodnot vlastností,
-   přesný způsob výběru aktivní postavy / přepínání mezi více postavami na jednom účtu,
-   přesný počet a obsah budoucích stran Studentského průkazu,
-   přesné vizuální označení proficiency u záchranných hodů,
-   finální barevná paleta a vizuální charakter „D&D akademie“ (směr je přívětivější a barevnější, přesné řešení ještě není uzavřené).

Neřešit je předčasně jen kvůli „kompletnímu návrhu".

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

## 39. UI/UX směr

FE polish nemění produktové chování ani herní mechaniky.

### Globální vizuální směr

Schválený vizuální směr celé aplikace je:

> **Akademický atlas / školní registr magické akademie.**

Vizuální referencí je schválený návrh akademie **Academia Magna Illistrass**.
Reference neurčuje přesný layout ani se nekopíruje 1:1. Slouží jako vodítko
pro celkový vizuální jazyk aplikace:

-   teplý papírový / ivory základ,
-   tmavý inkoustový text,
-   jemné lineární rámečky a dělení sekcí,
-   tlumené zlato a hlubší heraldické akcenty,
-   akademicko-kartografický charakter,
-   kombinace výraznějšího serifového písma pro titulky a dobře čitelného
    běžného písma pro obsah a ovládací prvky.

Atmosféra má připomínat školní registr, atlas, archivní kartu nebo studijní
záznam z magické akademie. Nemá působit jako moderní SaaS/admin dashboard.

### Použití napříč aplikací

Tento vizuální jazyk je globální směr pro:

-   `character.html`,
-   `index.html`,
-   okolní UI `game.html`,
-   tlačítka, panely, navigaci a studijní informační plochy.

Samotný **map-space je herní obsah**. Nemá se kvůli vizuálnímu sjednocení
přebarvovat, filtrovat ani měnit jeho souřadnicová či drag logika.

Styl se zavádí postupně:

1.  `character.html` jako referenční stránka,
2.  po ověření `index.html`,
3.  následně okolní UI `game.html`.

Tím omezujeme náklady na případnou změnu směru.

### Preferujeme

-   jasnou vizuální hierarchii,
-   teplý světlý základ místo mintového admin vzhledu,
-   serifové titulky / názvy sekcí v rozumné míře,
-   velmi čitelný běžný text a formulářové prvky,
-   jemné rámečky místo množství moderních „card“ boxů,
-   konzistentní spacing,
-   dostatečně velké click/tap targets,
-   viditelné hover/focus/disabled/error stavy,
-   tlumené heraldické akcenty,
-   jednoduché symboly jako orientační pomůcku,
-   read-only režim, který působí jako záznam / přehled, ne jako formulář,
-   záložky Studentského průkazu, které mohou připomínat jednoduché
    archivní/indexové záložky.

### Nechceme

-   těžké pergamenové textury přes celé UI,
-   dekorativní fantasy rámy,
-   ornamentální přeplácanost,
-   špatně čitelné fantasy fonty,
-   šest křiklavých barev pro šest vlastností,
-   výrazné gradienty a efekty,
-   CSS framework jen kvůli vzhledu,
-   nový JS framework,
-   design system jako samostatný projekt,
-   animace pouze pro efekt,
-   velké změny layoutu bez UX důvodu.

Přesné hex hodnoty nejsou produktové rozhodnutí. Mohou se iterativně
upravovat podle reálného vzhledu a čitelnosti.

Referenční stránkou pro první ověření stylu zůstává `character.html`.

------------------------------------------------------------------------

## 40. Jak tento dokument používat

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
