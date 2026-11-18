# Integration delta: v003.2 → v003.3

**Point release.** Swap `manifest.json` and `animation/` (re-baked clips). Smear tiles for the dagger thrust (and any regenerated strike frames) may change. Machine-readable version: `INTEGRATION-DELTA-v003.2-to-v003.3.json`.

## Unchanged (validated by `delta_v0032.py`)
- Every part, material, mask, plate and (non-smear) fx PNG (byte-identical), pivots, sockets, z, root, ground_y, stage 800×800 / rig origin (80,160), weapon grips.
- `poses.idle` (A1), `poses.victory` and `poses.defeat` (A3 approved), portrait rule and renders, every other v003.2 pose number except the two listed below.

## Changed
- `poses.follow_through.axe`: arms re-solved so the axe is visor-clear (0 weapon px on the face). Body and legs unchanged.
- `poses.knockout` remains the stagger key of the knockout clip (the clip timing changed: floor hold + ease into defeat, no bounce key).
- All A2 clips re-baked: see frame counts below. Per-part angular velocity is ≤ 45°/frame (angle-unwrapped) on every adjacent pair, including the walk loop seam, except the named frames in `validation/av-exceptions.json` and any frame whose smear covers an arm. Axe attack is 56 frames (v003.2: 51) so the coil→whip flip can stay a one-frame smear trick; the long overshoot→idle repair was dropped.

## Frame counts
sword: 24/41/17/21/46, axe: 32/56/23/19/49, dagger: 16/33/15/19/44 (walk/attack/dodge/hit_react/knockout).

## Renderer changes
1. Drop in the new `animation/clips.json`. Playback is unchanged (one baked frame per tick at 30 fps). Some contact indices and frame counts shifted.
2. Knockout: hold the floor squash, then ease into `poses.defeat`. The last frame is matrix-identical to the approved v003.1 defeat pose.
3. Dagger thrust smears are generated from the coil pose to the current frame so the trail covers the full travel; still drawn at `offset_rig_px`, z 84, visor-cleared, mirrored with the bot.
