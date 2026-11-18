# A6 screen art — D9 Tale of the Tape and D8 Opponents

Framing copies the UI/UX mockups (`d9-tale-of-the-tape.html`, `d8-opponents.html`). All numbers in pt; screen y is measured from the top of the screen area under the 24 pt status bar.

## D9 Tale of the Tape face-off

| item | value |
|---|---|
| top band | 390 × 400 (wall gradient `#3F463C → #59604F`, floor from 60 % `#CBB48A → #B89F74`), 4 pt ink rule under it |
| bots | idle pose, **same scale**, body height **196** (weapons extra), left faces right, right **mirrored** to face left |
| body centre x | left **98**, right **292** (left bot bleeds off the left edge as in D9) |
| shared ground line | **y 322**, contact shadows under both |
| VS badge | centred, y ≈ 176, italic Inter 900 46 pt, mustard with ink stroke + 4 pt drop |
| name plates | Garage Tag ink plates 168 × 51 at y 326, x 12 / 210; player's plate has the Oxide rim |

Deviation from D9, on purpose: D9 puts the feet at about y 351 behind the name plates. A6 lifts the ground line to 322 so feet and shadows read and both bots clearly stand on one floor. Body 196 vs about 200 in D9: same read, and the weapons cross less over VS.

Files: `tott/faceoff-petrol-axe-vs-weld-tess{,@2x,@3x}.png` (transparent 390 × 400 layer, bots + shadows only) and `tott/faceoff-hazard-hammer-vs-frost-kit@2x.png` (a second combo with a pattern, heavy shapes and a shield). Any combo: `source/build_screens.py::faceoff_layer(left, right, S)` with `{paint, weapon, head, chest, arms, legs, off_hand}`. In app, draw each bot with the kit rig at scale `196 / body_px`, feet on y 322, right bot mirrored about its own centre.

Mockup: `previews/tale-of-the-tape-390x844{,@3x}.png`, Petrol (Chispa, player) vs Oxide (Weld Tess). Stats table rows are the A6 brief's HP / Strength / Agility / Speed / Weapon / Record W-L, all **MOCK**. D9's rows are Record / Win streak / Level / Weapon / Paint, and the stat set is D9's call. The table is 30 pt rows (D9: 36) so that six rows fit. Then the big FIGHTS REMAINING 2/3 with "Refill in 05:12:33", then START FIGHT.

## D8 Opponents

| item | value |
|---|---|
| list viewport | y 168 → 714 (**546**), clipped |
| card | 358 × **175**, radius 10, 3 pt border, 3 pt ink drop |
| gap | **10** → snap pitch **185**; 3·175 + 2·10 = 545 ≤ 546 → exactly 3 full cards, never a half card |
| snap | `snapToInterval = 185`, start alignment, `decelerationRate = 'fast'`; max offset for n cards = (n − 3) · 185 |
| art panel | **170 × 169** inside the border, rounded left corners 7, 3 pt ink divider at the right |
| robot | idle, **mirrored (faces left)** like D8, body height **150** + weapon, feet at y **162**, body centre x 92 in the panel |
| text column | name Inter 900 22 pt caps (18 pt if wider than 165 pt), Botore name 13/700, dashed rule, record "19W – 2L" (22/900 numbers). No weapon badge, no paint text |
| header | big FIGHTS REMAINING 2/3 panel 358 × 76 at y 66, "Refill in 05:12:33" |

Robot size: the old list showed about 90 pt; the brief asked for 160–180 pt tall. The D8 panel is 169 pt inside, so the body is 150 and about 165 with the head-to-feet weapon reach. That is 1.7× the old size and as big as D8's panel allows. Say so if D8 should get taller cards.

Files: `opponents/{npc}{,@2x,@3x}.png` (12 NPCs, transparent panel-size 170 × 169), `opponents/{npc}-panel-bg@2x.png` (with D8's radial cream panel background). Mockup: `previews/opponents-390x844{,@3x}.png`.
