# Podrasy postav

Tato mapa je kontrakt pro navazující UI ticket. `characters.subrace_code` je
volitelný (`NULL` znamená bez vybrané podrasy) a databáze přijme pouze tyto
kombinace s existujícím `race_code`:

| `race_code` | `subrace_code` | Název pro UI |
| --- | --- | --- |
| `dwarf` | `hill_dwarf` | Hill Dwarf |
| `dwarf` | `mountain_dwarf` | Mountain Dwarf |
| `elf` | `high_elf` | High Elf |
| `elf` | `wood_elf` | Wood Elf |
| `elf` | `drow` | Drow |
| `halfling` | `lightfoot_halfling` | Lightfoot Halfling |
| `halfling` | `stout_halfling` | Stout Halfling |
| `gnome` | `forest_gnome` | Forest Gnome |
| `gnome` | `rock_gnome` | Rock Gnome |

Používejte `loadCharacter` a `updateCharacterField(..., 'subrace_code', value,
sessionToken)`. Kód nelze uložit k jiné rase: kontroluje jej RPC i databázový
constraint. Po skutečné změně `race_code` se `subrace_code` atomicky nastaví na
`NULL`; zápis téhož `race_code` ani úprava jiného pole jej nemění.
