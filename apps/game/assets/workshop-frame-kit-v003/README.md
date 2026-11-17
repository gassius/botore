# Botore Workshop Frame kit v003.1

This is a point release on top of kit v003 (A1 approved). It contains **no new part art**: every part, material, mask, fx and plate PNG is byte-identical to v003. Only `manifest.json` (poses, stage, timing, portrait rule), the portrait samples and the previews change.

| Ticket | What v003.1 delivers |
|---|---|
| A3 | **Victory redone.** The weapon arm is raised overhead-forward and the weapon is held high on a diagonal. The chest opens, the chin lifts and the rear fist pumps up and back, giving a V silhouette. **Defeat fixed.** Both knees and both toe caps now touch `ground_y`. The rear knee no longer floats and the boots no longer read as slabs. The plates are unchanged (already approved). |
| A2 (first pass) | 8 fight keys for each weapon, in the same pose format: `walk_in, windup, strike, follow_through, recovery, dodge, hit_react, knockout`. A 30 fps timing table with hit-stop is in `manifest.timing`. |
| A5 | **Portrait rule.** Each bot's portrait is rendered from that bot's own paint and weapon (`manifest.portrait.rule`). There is a per-weapon portrait pose with the weapon in frame. The example renders cover 3 loadouts, one of which uses a **non-sample test paint** (Scrap Green `#6E8B3D` with the dagger). |

## Stage (canvas growth)
The 640×640 rig frame and **all** rig numbers are unchanged; only the drawing surface grows. Allocate `stage.size` = 800×800 and draw the rig translated by `stage.rig_origin` = (80, 160). Equivalently, allow 160 px of overflow above the frame and 80 px on each side. Victory and the attack keys use this margin. Idle, defeat and the portrait stay inside the 640 frame (validated).

## Pose format (unchanged since v003)
`{poseId: {weaponId | '*': {root: {x, y}, parts: {partId: {rot}}}}}`

- Lookup is `poses[poseId][weaponId] ?? poses[poseId]['*']`.
- `rot` is in degrees and is added to the part's default `angle` (clockwise is positive, Y points down). `torso.rot` is the root rotation.
- The weapon follows `hand_r.grip` through `weapons[w].grips.main.attach_angle`.
- Old motionPose names resolve through `pose_aliases`: `quick_attack` and `heavy_attack` map to `strike`, `heavy_windup` to `windup`, `hit` to `hit_react`. `dodge` keeps its name.
- **Blend rule:** linear on `root` and on each `rot`. v003.1 stores each rot so that every part's world angle travels the short way from that weapon's idle. As a result the axe no longer swings through the floor between idle and windup.
- Between keys the large arcs are intentional. For example, the sword goes from windup to strike with +190° on `hand_r`, which is the overhead slash.

## A2 timing (30 fps) — `manifest.timing.per_weapon[weaponId]`
A sequence is a list of segments `{to, frames, ease}`. Each segment blends from the previous key to `to` over `frames` frames. `hold` and `hit-stop` keep the pose frozen. Hit-stop freezes **both** bots, and is skipped on a miss.

| weapon | windup (+hold) | strike | hit-stop | follow-through | recovery | back to idle | total attack |
|---|---|---|---|---|---|---|---|
| sword | 7 (+3) | 2 | 3 | 4 | 6 | 5 | 30 f = 1.00 s |
| axe | 10 (+5) | 3 | 5 | 6 | 10 | 7 | 46 f = 1.53 s |
| dagger | 4 (+1) | 2 | 2 | 3 | 4 | 3 | 19 f = 0.63 s |

- **Dodge:** sword 3 in, 4 hold, 6 out; axe 4/4/8; dagger 2/3/5.
- **Hit react:** 2 frames snapping in, then the attacker's hit-stop, then a short hold, then 8–10 frames out.
- **Knockout:** 3 in, KO hit-stop of 6/8/6, an 18-frame hold, then 12–14 frames easing into `defeat`, then roughly 1 s before the result overlay.
- **Walk-in:** alternate `walk_in` and `idle` every 6/8/5 frames while translating the root.
- **reducedMotion:** snap between keys, no walk bob, 0 hit-stop frames.

## Weapon reads
- **Sword:** overhead diagonal slash. The windup is high with the blade back and up over the helmet, the strike ends forward-down, and the follow-through finishes low.
- **Axe:** two-handed heavy chop. In the windup the head is raised behind the helmet with both hands low and back. The strike cuts forward at waist height and the follow-through ends by the front boot. The off hand is exact on `grip_off` in every A2 key.
- **Dagger:** reverse-grip punch-stab. The windup is a chambered fist at the chest with the blade pointing forward, the strike is a lunge with the arm fully extended and the blade leading, and the follow-through dips down. It is a real stab, not the guard rotated.

## Files
- `manifest.json`
- `INTEGRATION-DELTA-v003-to-v003.1.md` + `.json`
- `previews/`:
  - `contact-sheet-390x844.png`
  - `fight-sheet-{weapon}-390x844.png`
  - `fight/a2-{weapon}-strip.gif` (30 fps)
  - `fight/a2-{weapon}-strip@2x.mp4`
  - `victory-v003-vs-v003.1.png`
  - `defeat-v003-vs-v003.1.png`
  - `ranking-portraits.png`
  - `phone/*`
- `portraits/{loadoutId}-{96|192|288}.png`
- `validation/` (report, negative tests, visual review)
- `source/` (full rebuild)

## Rebuild
Run these from `source/`:

1. `python3 author_v0031.py` (IK solve, about 3 min)
2. `python3 build_kit_v0031.py`
3. `python3 previews_v0031.py`
4. `python3 validate_kit_v0031.py ../kit-v003.1`
5. `python3 negative_test_v0031.py`
6. `python3 delta_v0031.py`
7. `python3 seal_kit_v0031.py`

The build is deterministic and makes no network calls or paid generations.
