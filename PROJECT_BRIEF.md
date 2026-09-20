# PROJECT BRIEF --- Webová aplikace pro dětské D&D

**Stav dokumentu:** výchozí scope pro MVP\
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

> **1 účet = 1 dítě = 1 postava = 1 deník = 1 hráčský token.**

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

Portrét postavy je zároveň obrázkem hráčského tokenu.

Hráč může vlastní obrázek změnit, pokud implementace zůstane jednoduchá.
Nevytváříme editor avatarů, cropper ani složité zpracování obrázků.

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

-   STR
-   DEX
-   CON
-   INT
-   WIS
-   CHA

Dítě zadává hodnoty vlastností samo. Může existovat jednoduchá pomůcka
pro hod na vlastnosti podle používaného způsobu tvorby postavy; aplikace
ale výsledky sama nerozděluje.

Aplikace automaticky vypočítá:

-   modifikátory vlastností,
-   proficiency bonus podle levelu,
-   bonusy dovedností,
-   bonusy záchranných hodů.

Dítě označuje proficiency u skills/saves.

Samotný hod provádí dítě a samo přičítá zobrazený bonus.

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

Rychlost je ručně zapsaná hodnota, například `9 m`.

Aplikace podle ní neomezuje token, nepočítá hexy a nekontroluje pravidla
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

## 22. Mapy a hex grid

PJ může předem nahrát mapy, pravděpodobně PNG.

Zdrojové mapy jsou bez gridu. Aplikace přes ně vytvoří vlastní hex grid.

PJ při přípravě nastaví velikost hexu a vidí okamžitý náhled. Jakmile se
mapa používá, velikost gridu už neměníme.

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

Vedoucí má seznam připravených map.

Hráči tento seznam nevidí a nemají dostávat názvy, náhledy ani data
neaktivních map.

Vedoucí nastaví aktivní mapu a hráči jsou automaticky přepnuti v
realtime.

PJ řídí scénu. Hráč mapu nevybírá.

------------------------------------------------------------------------

## 24. Zoom a pan

Každý uživatel ovládá vlastní lokální zoom/pan.

Camera state se nesynchronizuje.

Mapa, hex grid a tokeny musí být v jednom vizuálním/souřadnicovém
prostoru.

Důležitý acceptance test:

> Umístit token na hex → opakovaně změnit zoom a posun mapy → token
> zůstává přesně na stejném hexu.

------------------------------------------------------------------------

## 25. Hráčské tokeny

Hráčský token používá portrét postavy.

Vedoucí umisťuje hráčské tokeny na mapu.

Hráč může pohybovat pouze vlastním tokenem. Vedoucí může pohybovat
kterýmkoliv hráčským tokenem.

Pohyb:

1.  drag probíhá lokálně,
2.  po puštění se token snapne na nejbližší hex,
3.  výsledná pozice se synchronizuje ostatním.

Nesynchronizujeme kontinuálně každý pixel pohybu.

Každá mapa si pamatuje poslední pozice tokenů.

Postava může na konkrétní mapě nemít žádnou pozici. To znamená, že není
v dané scéně.

Vedoucí může token z mapy odebrat bez smazání účtu, postavy nebo deníku.

Token zůstává na mapě i při odpojení hráče. Nesledujeme online/offline
presence.

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

## 27. Persistence a realtime

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

## 28. Autosave

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

## 29. MVP

MVP zahrnuje:

1.  jednoduché přihlášení předem vytvořených účtů,
2.  dvě role Hráč / Vedoucí,
3.  domovskou stránku Můj deník / Vstoupit do hry,
4.  jednoduchý seznam hráčů pro Vedoucího,
5.  jeden účet = jedna postava,
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
32. upload/příprava map Vedoucím,
33. generovaný hex grid a nastavení velikosti,
34. lokální zoom/pan,
35. knihovna připravených map pouze pro Vedoucího,
36. jedna aktivní mapa a realtime přepnutí hráčů,
37. hráčské tokeny s map-specific pozicemi,
38. drag/drop + snap na hex + synchronizace po dropu,
39. NPC tokeny lokální pro mapu,
40. NPC bez obrázku s jednoduchým placeholderem,
41. NPC visible/hidden, pokud nezkomplikuje MVP,
42. jednoduché kostky,
43. krátkodobý společný roll log,
44. persistence důležitého stavu a reconnect.

------------------------------------------------------------------------

## 30. Výslovně mimo MVP

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
-   více postav na účet,
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

## 31. Definice úspěchu

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

## 32. Rizika

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

## 33. Roadmapa prvních 20 dní

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
-   hex grid,
-   nastavení velikosti hexu,
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

## 34. Prioritizační model

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

## 35. Pravidlo pro změnu scope

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

## 36. Otevřená rozhodnutí

Následující věci zatím nejsou definitivně uzavřené a mají se řešit až ve
chvíli, kdy jsou potřeba:

-   přesná informační architektura záložek kompaktního deníku,
-   finální technické řešení backendu/realtime (Supabase je pracovní
    kandidát),
-   přesný datový model,
-   přesná implementace hexových souřadnic,
-   konkrétní způsob uploadu/omezení obrázků,
-   rozsah class-specific částí deníku,
-   zda hidden NPC zůstane v MVP po technickém spike,
-   detaily jednoduché pomůcky pro generování hodnot vlastností.

Neřešit je předčasně jen kvůli „kompletnímu návrhu".

------------------------------------------------------------------------

## 37. Zlatá pravidla projektu

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

## 38. Jak tento dokument používat

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
