# A6 carousel tiles — D7 Customise

Sizes follow the UI/UX D7 mockup (`/workspace/botore-design-critiques/apk-2026-11-18/mockups/d7-customise-*.html`). The A6 brief asked for a square tile with 3 across 390 pt at 16 pt padding and 12 pt gaps (that maths gives 111.33 pt, so 111 pt with a 357 pt viewport). **D7 wins**: 105 × 128 pt tiles, 11 pt gaps.

## Numbers (pt)

| item | value |
|---|---|
| tile | **105 × 128**, radius 9, 3 pt ink border, 3 pt ink drop shadow below (canvas adds it) |
| gap | **11** |
| snap pitch | **116** (= tile + gap) |
| 3 tiles + 2 gaps | 3·105 + 2·11 = **337** |
| carousel viewport | **337 wide, clipped (`overflow: hidden`)**, centred: x 26.5 → 363.5 on a 390 screen (or left-aligned at x 16 like the D7 mockup, → 353) |
| snap | `snapToInterval = 116`, `snapToAlignment = 'start'`, `decelerationRate = 'fast'`, no content padding inside the clipped viewport, no trailing gap after the last tile |
| paints (10) | content 10·105 + 9·11 = 1149; max offset 1149 − 337 = **812 = 7 × 116** → last stop shows tiles 8–10 exactly |
| weapons (7) | content 7·105 + 6·11 = 801; max offset 801 − 337 = **464 = 4 × 116** → last stop shows tiles 5–7 exactly |

Why the clip matters: with D7's 16 pt strip padding and no clip, the 4th tile starts at x 364 and shows a 26 pt sliver. Clipping the scroll view to 337 pt means every rest position shows exactly 3 whole tiles, never 2.5.

Pager label "7–9 of 10" = stop index + 1 … + 3. Dots = `ceil((n − 3) + 1)` stops or pages of 3, your call.

## Files (`tiles/`), PNG @1x / @2x / @3x, transparent

| folder | what | size @1x |
|---|---|---|
| `swatch/{paint}.png` | 66 pt swatch (D7 `.sw`): main colour or the pattern itself, trim band along the bottom, accent rivet, ink rim baked | 66 × 66 |
| `weapon/{weapon}.png` | weapon icon in the outlined style, rendered from the A4 parts (Oxide accent stain, Oxide shield face), tilted 35–45° (shield flat) | 92 × 92 (D7 `.wart` box) |
| `tile-paint/{paint}-{default,selected,locked}.png` | full tile, swatch at y 12 (+9 overhang), PATTERN tag on hazard/racing | 114 × 140 |
| `tile-weapon/{weapon}-{default,selected,locked}.png` | full tile, icon box at y 3 (+9 overhang) | 114 × 140 |

Full-tile canvas = tile 105 × 128 + 3 pt shadow + **9 pt overhang top and right** for the selected check badge (D7 `.chk` at −9/−9). Place the canvas at (tileX, tileY − 9). Labels (CINDER, HAZARD, MACE…) are **app text**, not baked: Inter 13 pt, weight 800, caps, letter-spacing .08em, centred, baseline area y ≈ 101–118 in the tile.

States: default = cream-white `#FFF8E8`; selected = mustard `#F4B820` + check badge; locked = paper veil + mustard padlock top-right (only if something is still gated; all approved weapons should be unlocked per D7).

Paints: 10 ids in `paints.json` order: oxide, petrol, primer, ink, drab, cobalt, frost, cinder, **hazard** (diagonal stripe pattern), **racing** (horizontal stripe pattern). Weapons: sword, axe, dagger, mace, hammer, spear, shield.

Preview: `previews/tiles-carousels@2x.png` (first and last snap stop of both carousels with the viewport outlined in Oxide, the 3 states, all swatches and icons).
