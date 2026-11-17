# Integration delta: kit v003 → v003.1

## Unchanged (kept exactly as in v003)
- Every part, material, mask, fx and plate PNG is byte-identical, and the file paths are the same.
- Pivots, sockets, z values, `root.position`, `ground_y` and `canvas` (the 640 rig frame) are unchanged.
- `weapons[*].grips` are unchanged.
- **Idle poses are byte-identical** (the A1-approved numbers).

## Changed or added
1. **`stage`** (new). The drawing surface is 800×800 with the rig at (80,160). **The renderer must allocate it, or allow overflow of 160 px above and 80 px on each side.** Otherwise victory and the attack keys clip.
2. **`poses`**:
   - **Changed:** `victory` (redone), `defeat` (legs fixed), `dodge` (new A2 art) and `portrait` (now per weapon).
   - **Added:** `walk_in, windup, strike, follow_through, recovery, hit_react, knockout`.
   - **Aliased** (identical numbers, kept so the F7 `motionPose` values still work):
     - `quick_attack` → `strike`
     - `heavy_attack` → `strike`
     - `heavy_windup` → `windup`
     - `hit` → `hit_react`
3. **`timing`** (new): 30 fps sequences per weapon, with hit-stop.
4. **`pose_aliases`** and **`qa_regions.face`** (new; the face region is used for QA only).
5. **`portrait`**:
   - `exclude_assets` is now `[]`, so the weapon is drawn.
   - There is a new `rule`: render from the bot's **own** `paintId` (or hex) plus `weaponId`, and never reuse the sample PNGs.
   - The crop changed to `crop_center_offset [16,-4]` and `crop_size 272`, giving `crop_rect_canvas_px [190, 41.4, 272, 272]`.
   - The samples are now keyed by loadout: `oxide-sword`, `petrol-axe` and `scrapgreen-dagger` (test paint `#6E8B3D`). The v003 `oxide-*` and `petrol-*` portrait files are removed.
6. `motion_bounds` widened where the new poses need it. The exact values are in the JSON delta.

## Renderer checklist
- [ ] Use an 800×800 stage, or allow overflow, and translate the rig by `stage.rig_origin`. Mirror still happens about rig x=320.
- [ ] Play A2 from `timing.per_weapon[weaponId]`. Hit-stop freezes both bots on contact and is skipped on a miss.
- [ ] Render portraits per bot from its own paint and weapon (`poses.portrait[weaponId]`, `portrait.crop_rect_canvas_px`). Cache the result by kit version, paint, weapon and size.
- [ ] Keep blending all rots linearly. Do not re-solve the axe off hand.
- [ ] Do not port v002 numbers. v003 idle numbers remain valid.
