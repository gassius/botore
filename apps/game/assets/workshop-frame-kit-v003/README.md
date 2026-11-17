# Botore Workshop Frame — kit-v003

**Integration prototype, not art/rig/production accepted.** v003 fixes how weapons are held and adds stance, result poses, result plates and ranking portraits on the same modular rig. Built from kit-v002 (`/workspace/botore-art/2026-11-09-first-kit/kit-v002/`, unchanged). Original vector construction, no paid generation. **Coordinates are NOT interchangeable with v002. Swap the whole pack at once.**

## Start here
| File | What it shows |
|---|---|
| `previews/contact-sheet-390x844.png` (`@3x` alongside) | 3 weapons × 2 paints × idle/victory/defeat on one 390×844 phone screen |
| `previews/phone/{pose}-{weapon}-{paint}.png` | 18 individual 390×844 @2x phone checks (customise-style panel for idle, dimmed arena + plate for results) |
| `previews/fight-scale-axe-vs-sword@2x.png` | Oxide axe vs mirrored Petrol sword, at the environment-v001 fight positions and scales |
| `previews/axe-v002-vs-v003.png` | Before/after for the axe Carlos flagged |
| `previews/grip-closeups.png` | 3× close-ups of every gripping hand (fingers over handle) |
| `previews/combat-carried-sheet.png` | The v002 combat poses re-based on the new guards (carried over, not re-art-directed) |
| `previews/plates-preview.png`, `previews/ranking-portraits.png` | Result plates, sample ranking portraits |
| `manifest.json` | Rig, weapons/grips, poses, fx, plates, portrait spec |
| `INTEGRATION-DELTA-v002-to-v003.md` + `integration-delta-v002-to-v003.json` | What engineering has to change |
| `validation/report.json`, `validation/negative-tests.json`, `validation/visual-review.md` | Automated checks, proof that the checks catch the v002 bugs, and my visual review with weaknesses |

## What changed vs v002
1. **Per-weapon grips (replaces the single shared 180° mount).** Each weapon is a child of `hand_r.grip`. Its `pivot` is its own `grip_main` socket and its `angle` is the per-weapon `attach_angle`. +90 puts the striking end out of the thumb side, −90 out of the little-finger side.
   - **Sword**: one-handed, `attach_angle` 80, blade up and forward. The grip was lengthened to 64 px with a pommel, so the handle visibly leaves the fist on both sides.
   - **Axe**: redrawn as a two-handed war axe. The haft is 316 px with leather wraps where the hands go. The main grip sits in the lower third (0.36 of the haft length from the butt) and the off-hand grip is near the butt (`grip_off`). The bit faces local +X, which is toward the opponent in every guard. The rear hand is held on `grip_off` by baked rotations (error ≤ 0.65 px, 0.1°).
   - **Dagger**: **reverse (ice-pick) grip**, `attach_angle` −90. I chose it because at fight scale a forward-held dagger reads as a stubby sword, while the reverse grip gives a raised-fist guard with the blade angled down toward the opponent, a silhouette no other weapon has.
2. **Hands that close around the handle.** Each hand is now two tiles. The `hand_*` back layer (wrist hub, palm housing) is drawn *behind* the weapon, and the new `hand_*_wrap` layer (four curled fingers, knuckle bar, thumb) is drawn *in front of* it. Draw order is always hand < weapon < wrap. For the axe the rear wrap is raised to z 91 via `weapons.axe.z_overrides`.
3. **Per-weapon guard stances** (`poses.idle.{sword|axe|dagger}`), with feet planted on `ground_y`.
4. **Result poses on the rig**: `victory` (weapon raised, chest out, rear fist pumped behind the head) and `defeat` (both knees down, slumped, head hanging, weapon grounded), each per weapon, plus the optional `fx.defeat_sparks` (3 frames, 1x/2x).
5. **Plates**: `plates/` VICTORY, DEFEAT and NEW RECORD in Garage Tag style. SVG plus transparent PNG @1x/2x/3x. The letters are vector geometry built to the launch-v001 wordmark rules (rounded heavy blocks), with no font dependency.
6. **Portraits**: head-and-shoulders spec built from the rig (`manifest.portrait`), plus sample Oxide/Petrol renders at 96/192/288 px in `portraits/`.
7. **2x tiles**: `parts@2x/`, `materials@2x/`, `masks@2x/`, `fx@2x/` use the same coordinates. At phone sizes the 1x tiles get upscaled, so use these on ≥2x screens.
8. **Pose data format** replaced (see below). The v002 combat pose names (`quick_attack`, `heavy_windup`, `heavy_attack`, `dodge`, `hit`) are kept and re-based on the new per-weapon guards. For the axe both hands stay on the haft.

## Rig contract (unchanged parts in brief)
Canvas 640×640, root `torso` at [310,276], +X right, +Y down, clockwise-positive degrees, column-vector matrices, all numbers in 1x canvas px. `ground_y` = 495 (bottom of the boot soles).

```
M_torso = T(root.position + pose.root) · R(pose.parts.torso.rot) · T(-torso.pivot)
M_child = M_parent · T(parent.sockets[parent_socket] (+ weapons[w].grips.main.offset for the weapon))
                   · R(child.angle + pose.parts[child].rot) · T(-child.pivot)
```
- Draw in ascending `z`, after applying `weapons[weaponId].z_overrides`. Only draw the equipped weapon asset.
- `facing` left: mirror the whole assembled hierarchy, `T(640,0)·S(-1,1)`. Never flip tiles individually.
- Paint: `material_under`, then `paint_mask` alpha tinted with `paint_tokens[paintId]`, then `material_over`. `parts/{id}-{paint}.png` are pre-composited fallbacks. Hands, wraps and weapons are unpainted steel (their masks are empty on purpose).

## Pose format (`manifest.poses`)
```
{ poseId: { weaponId | "*": { root: {x, y}, parts: { partId: { rot } } } } }
```
- Lookup: `poses[poseId][weaponId] ?? poses[poseId]["*"]`.
- `root.x/y`: px added to `root.position`. `rot`: degrees **added to the part's default `angle`**, around its own pivot. A missing part means 0. `parts.torso.rot` is the root rotation.
- The weapon is never posed directly. It follows `hand_r` through its grip.
- Blending: linear interpolation of `root.x/y` and every `rot` between two entries of the same weapon is valid. Values are stored as the 360° representative closest to that weapon's idle, so blends don't spin joints. Don't re-solve IK in the engine. The axe's off-hand rotations are baked so the rear hand stays on the haft at both pose endpoints. (Mid-blend it can drift a few px, since this isn't proven per frame.)
- `pose_meta` gives each pose's kind, use, foot contact and fx.

BotAssembler mapping (existing props unchanged): `weaponId` → `weapons[weaponId].asset` + grips; `paintId` → `paint_tokens`; `motionPose` → `poses` key (default `idle`); `facing` → mirror; `reducedMotion` → snap to the target pose, no tween, plates still shown.

```ts
// engine-agnostic sketch
const pose = m.poses[motionPose ?? 'idle'][weaponId] ?? m.poses[motionPose ?? 'idle']['*'];
const z = {...Object.fromEntries(m.assets.map(a => [a.id, a.z])), ...m.weapons[weaponId].z_overrides};
for (const a of topoOrder(m.assets)) {               // torso first, parents before children
  if (a.role === 'weapon' && a.id !== m.weapons[weaponId].asset) continue;
  const rot = pose.parts[a.id]?.rot ?? 0;
  M[a.id] = a.parent == null
    ? T(m.root.position[0] + pose.root.x, m.root.position[1] + pose.root.y).mul(R(rot)).mul(T(-a.pivot[0], -a.pivot[1]))
    : M[a.parent].mul(T(...socket(a))).mul(R(a.angle + rot)).mul(T(-a.pivot[0], -a.pivot[1]));
}
drawSortedBy(z);
```

## Result screen use
- **Own bot on the result overlay**: render `victory` or `defeat` with the confirmed loadout/paint/weapon. During the defeat hold, optionally play `fx.defeat_sparks` frames 00→02 at its socket (`torso.shoulder_l` + offset, screen-up). Frame timing is not approved.
- **Plates**: `plates.victory|defeat|new_record`. Sizes are in pt (300×96, 300×96, 220×64). Use the `accessibility_label` text. The plates are images, so an engine text label/announcement is still needed. NEW RECORD is a tilted stamp meant to overlap the plate's lower-right corner.
- **Portraits**: render pose `portrait` without the weapon, crop square `crop_rect_canvas_px` [178, 37.4, 256, 256] (anchored to the world `torso.neck` + [-4,-16]), and downsample to 96/192/288. Samples are in `portraits/`. They are built from the rig, so any paint (or a future head part) keeps the framing.

## Reproduce / verify
Python 3, CairoSVG, Pillow, NumPy, SciPy:
```
python3 source/build_kit_v003.py      # parts, masks, poses (solved -> baked rots), fx, plates, portraits, manifest
python3 source/previews_v003.py       # phone previews built ONLY from manifest + PNGs (source/mfasm.py)
python3 source/validate_kit_v003.py   # 2178 checks, independent of the authoring code
python3 source/negative_test_v003.py  # mutations that re-create the v002 bugs must fail validation
python3 source/delta_v003.py && python3 source/seal_kit_v003.py
```
Poses are authored as world targets (grip position, weapon angle, planted feet) in `source/author_poses.py`, solved with least squares (`source/rig.py`), and shipped as plain rotations. Engines need no IK.

## Honest quality boundary
See `validation/visual-review.md`. In short: the guards and result poses read clearly at phone size, but they are static key poses. Nothing here is approved animation timing. The v002 combat poses are only carried over, and `heavy_windup` puts the sword or axe across the face. The axe haft is about 2.3× the sword's grip-to-pommel length rather than the ~1.6× asked for (the reason is in the review). Wrist hub rotations are large in some axe and victory poses. Likeness and finish are still a clean vector reconstruction and not approved. Rights caveats are in `PROVENANCE.md`.
