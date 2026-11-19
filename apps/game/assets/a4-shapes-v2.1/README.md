# Botore A4 shape variety v2

Alternate Workshop Frame body parts that drop into kit **v003.3**. Pose rotations and world-space attachments are unchanged, so every v003.3 pose and A2 clip still plays.

Work root: `/workspace/botore-art/2026-11-18-a4-shapes/`

v1 (first pass) is archived under `v1/` for comparison and is not inside this zip.

Base kit (read-only): `/workspace/botore-art/2026-11-17-kit-v003/v003.3/kit-v003.3/` (manifest sha `8d30ada6…`)

A4 paints v3 (read-only): `/workspace/botore-art/2026-11-18-a4-paints/paints.json` (sha `3cdc0c7a…`)

This pack does not replace v003.3. No new weapons. The kit folder is never written.

## The set

Counting the current part as one of each:

| slot | id | what |
|---|---|---|
| head | `visor` | Current visor-slit helmet (kit tile) |
| head | `welder` | Welding mask: flat front face plate, side hinge bump, flip-up lens bar, two yellow visor bars. Not a rounded helmet. |
| head | `can` | Boxy tin-can with a top antenna, rectangular visor, no knight's grill |
| chest | `chassis` | Current offset chest plate (kit tile) |
| chest | `boiler` | Wide rounded barrel that bulges past both shoulders, rear chimney on the left, valve stub on the right |
| chest | `slab` | Taller, squarer door of armour, flat-topped shoulder line higher than stock, visible rivet-plate edge |
| arms | `stock` | Current upper arms and forearms (kit tiles) |
| arms | `heavy` | Boxed pauldron and a thicker gauntlet forearm (unchanged from v1) |
| legs | `stock` | Current thighs, shins and feet (kit tiles) |
| legs | `piston` | Fat thigh housings, exposed piston gap at the knee, wider blocky work-boot |

Digitigrade was not used. The v003.3 ankle and sole relationship is plantigrade; changing it would break walk-cycle plants and defeat contact.

Pelvis, hands and weapons stay on the kit tiles. Yellow visor bars `#FFE65C` and the charcoal frame stay in the over / under layers and are not tinted. New parts have paint masks compatible with A4 paints v3 and the shared wear algorithm (seed `0xA41E02`).

Heaviest combo: welder + boiler + heavy + piston.

## Rig contract

Heads and heavy arms keep the stock canvas, pivot and sockets. Chests and piston legs use a **larger canvas**. Pivot and socket *numbers* are shifted by the padding so world-space attachments stay identical to v003.3 (verified 0.0 px error on named poses). `ShapeKit` applies those overrides at assemble time; it does not rewrite the kit manifest.

| variant | canvas | pivot | sockets (padded) |
|---|---|---|---|
| torso boiler / slab | 292×234 | [150, 176] | neck [150, 81.4], shoulder_l [63.2, 95], shoulder_r [226.88, 105.8], waist [150, 197.6] |
| thigh piston | 164×150 | [82, 30] | knee [82, 92.32] |
| shin piston | 160×150 | [80, 30] | ankle [80, 104.1] |
| foot piston | 194×100 | [80, 30] | — |

L/R limbs share one tile, as the kit already does.

Face QA rects (head-local px), used by the validator:

- visor (stock): `[112, 58, 192, 142]`
- welder: `[112, 66, 188, 140]` (the window)
- can: `[116, 70, 182, 136]`

## Validator

`python3 source/validate_shapes.py` — **518 checks, 0 failures**.

The sealed kit validator is not imported (it has no main guard and would write into the kit). This script applies the same face, off-hand, joint and ground rules to ShapeKit assemblies.

- **Weapon vs visor:** 0 opaque weapon pixels in the face rect, every named pose and every clip frame, for all three heads. Smears also 0.
- **Hands vs visor:** the stock visor already has the axe off-hand / fist in the face on defeat, follow-through, late axe attack and knockout settle. That is existing v003.3 animation. Welder and can introduce no additional hand-in-face where the stock visor was clear.
- **Off-hand:** max 0.0186 px on named poses (released poses skipped). Matches the kit's own 0.019 px figure. Coordinate-only, identical for every combo.
- **Joints:** minimum opaque overlap 195 px (same as the kit).
- **Ground:** body within 3 px of `ground_y-1` (494), nothing below `ground_y+1` (496). The v1 piston defeat plant (lowest=497) is fixed in the boot sole art, not the rig. Piston knockout sits on the legal limit (lowest=496).

All 36 combinations (3×3×2×2) are covered: face depends only on the head, joints and ground were checked on a covering set including the heaviest combo.

### Visor-eye visibility (weapon-pass rule)

`source/eye_visibility.py` — at least **80%** of the yellow visor-eye pixels (`#FFE65C`) must stay:

- **visible** in the z-ordered composite on every pose and every clip frame (not covered by a weapon, hand, arm or smear drawn in front of the head);
- **clear of the chest** on stance poses and non-knockout clips (the pixel does not overlap the torso silhouette), so the eyes sit clear of the boiler or slab top.

Defeat, knockout and hit are exempt from the chest-clear test because the head is designed to rest on the chest; they still need 80% composite visibility.

The rule is checked on every head × chest combo. It was run on sword, axe and dagger so the shapes pack is ready; the same checks will hard-fail **mace** and **hammer** once those weapons exist. After a face notch on the slab (v2.1 working tree; the approved v2 zip is unchanged), the last run was **520 checks, 0 failures**. Welder + Boiler chest-clear min is 1.000 on stance poses; composite visible min is 0.950 (sword).

The slab notch keeps the high square shoulder corners and drops the plate under the visor. The 120 px silhouette still reads as a tall square door.

## Previews

All colour previews use sealed A4 paints v3 (`paints.json` sha `3cdc0c7a…`).

| sheet | path |
|---|---|
| Parts | `previews/parts-sheet.png` |
| 12 combos at 120 px, A4 v3 paints, yard floor | `previews/combo-sheet-12-120.png` |
| The same 12 as black silhouettes | `previews/silhouette-sheet.png` |
| Heaviest combo, sword attack + knockout | `previews/heaviest-attack-knockout-strip.png` |
| v1 vs v2 silhouettes | `previews/v1-vs-v2-silhouettes.png` |

Stock is top-left of the combo and silhouette sheets. Heaviest is row 2, column 4.

## Rebuild

From this folder:

```
python3 source/bake.py
python3 source/validate_shapes.py
python3 source/build_previews.py
```

`bake.py` rasterises the SVG planes at 1x and 2x and regenerates wear maps to match the mask sizes.
