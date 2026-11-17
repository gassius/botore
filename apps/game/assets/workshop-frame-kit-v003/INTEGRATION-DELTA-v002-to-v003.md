# F7 / v002 → v003 integration delta

Provisional media adaptation. **Atomic swap**: load v003's manifest and every PNG together, and never mix them with v002 tiles or numbers. Machine-readable values: `integration-delta-v002-to-v003.json`. BotAssembler props are unchanged.

## Unchanged
Canvas 640×640, root `torso` at [310,276], coordinate convention, whole-hierarchy mirroring, paint composite order, paint IDs `oxide`/`petrol` and tokens, weapon IDs `sword`/`axe`/`dagger`. Geometry, pixels, pivots and sockets are identical for torso, head, pelvis, upper arms, forearms, thighs, shins and feet. (The JSON lists those pivots/sockets only where int→float serialization differs; the values are equal.)

## Breaking changes (renderer must change)
1. **`weapon_grip_rotation_degrees` (global 180) is removed.** Each weapon asset is now a normal child: `parent: "hand_r"`, `parent_socket: "grip"`, `pivot` = its own `grip_main`, `angle` = `weapons[w].grips.main.attach_angle`. Delete the hardcoded 180° weapon special case and evaluate the weapon like any other child.

   | weapon | v002 pivot/grip | v003 pivot (= grip_main) | v003 angle | tile |
   |---|---|---|---|---|
   | sword | [60,163], rotated 180 | [60,184] | 80 | 140×208 → 140×244 |
   | axe | [60,163], rotated 180 | [64,214] (+ `grip_off` [64,292]) | 90 | 140×208 → 176×338 |
   | dagger | [60,163], rotated 180 | [50,127] | −90 (reverse grip) | 140×208 → 100×182 |
2. **Hands**: new tiles, 120×100 → 120×112, pivot [60,25] → [60,24], `grip` [60,61.6] → [60,62], plus a new `wrap` socket [60,24]. `hand_r.z` 90 → 80 so the hand sits under the weapon (85).
3. **New assets** `hand_l_wrap` (z 66) and `hand_r_wrap` (z 92): the finger layers, children of their hand at socket `wrap`, angle 0, never posed. Always draw them.
4. **`weapons[w].z_overrides`**: apply after the asset z values. The axe sets `hand_l_wrap` to 91 so the rear fingers close over the haft.
5. **Pose format replaced**: v002 `{pose: {part|root_x|root_y|root_angle: value}}` becomes v003 `{pose: {weapon|"*": {root:{x,y}, parts:{part:{rot}}}}}`, looked up as `poses[pose][weapon] ?? poses[pose]["*"]`. `root_angle` is now `parts.torso.rot`. Values were re-solved, not converted, so don't port v002 numbers.
6. **Pose IDs**: kept `idle`, `quick_attack`, `heavy_windup`, `heavy_attack`, `dodge`, `hit`, `defeat` (now per weapon, and `defeat` is a kneeling KO, not the v002 tilt sketch). Added `victory` and `portrait`.
7. **Axe two-handed rule**: `hand_l` isn't parented to the axe. Every axe pose except `victory`/`defeat`/`portrait` (`weapons.axe.off_grip_released_in`) has baked `upper_arm_l`/`forearm_l`/`hand_l` rotations that keep `hand_l.grip` on `grip_off`.
8. **motion_bounds** widened where the new poses need it (they are only ever widened against v002). Wrist (`hand_r`) is now [−115,185], because the round wrist hub carries large rotations in axe/victory poses.

## Additive (optional)
- `ground_y` 495. `resolution_variants` with `parts@2x/`, `materials@2x/`, `masks@2x/`, `fx@2x/` at the same coordinates.
- `fx.defeat_sparks`: 184×132 tile, pivot [84,100], positioned at `torso.shoulder_l` + [4,−22], kept screen-up, z 95, 3 frames.
- `plates` (VICTORY / DEFEAT / NEW RECORD, SVG + PNG 1x/2x/3x) and `portrait` (spec + samples): UI-side assets, not rig parts.

## Engineering checklist
- [ ] Load family `workshop-frame-v003` atomically and keep the v002 fallback separate.
- [ ] Weapon = normal child of `hand_r.grip`. No 180° special case.
- [ ] Draw `*_wrap` assets and apply `z_overrides`.
- [ ] Resolve poses with the new lookup. `reducedMotion` snaps to the target pose.
- [ ] Result overlay: `victory`/`defeat` pose + plate + an accessible text label (plates are images).
- [ ] Ranking: portrait render per the spec, or the samples as placeholders.
- [ ] On-device check: 1x vs 2x tiles at Customise size, mirrored opponent, and edge fringes on cream/dark.
