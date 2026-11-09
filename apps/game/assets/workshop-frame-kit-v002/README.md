# Botore Workshop Frame / kit-v002

**Usable integration prototype, not art/rig/production accepted.** Original editable illustrated vector construction based on the selected references, propagated from the provisionally reviewed v002 geometry with restrained clipped material planes. One coherent robot, not generated concept sheets. No paid generation used. Do not overwrite a published v002; edits after delivery require a new version.

## Start here
- `previews/kit-overview.png`: Oxide, Petrol, mirrored and three weapon classes.
- `previews/local-reassembly-proof.gif`: actual local PNGs transformed and recombined; not native animation/performance proof.
- `previews/pose-contact-sheet.png`: idle, quick attack, heavy anticipation/attack, dodge, hit, defeat.
- `source/workshop-frame-master.svg`: editable assembled neutral source. Per-part SVGs and deterministic `source/build_kit.py` retain all individual vector geometry/material separation.
- `manifest.json`: exact local canvas dimensions, pivot/socket positions, parents, layer order, named slots, provisional angle windows, paint tokens, inventory/hashes.
- `validation/report.json`: independent manifest-driven file, mask, grip and joint verification.

## Included
15 robot parts: head, torso, pelvis, and view-left/view-right upper arms, forearms, hands, thighs, shins, feet. Three weapons: sword, axe, dagger. 18 unique local shapes; 36 ready-composited Oxide/Petrol part PNGs. 18 matching paint masks (6 intentionally empty: pelvis, both hands and 3 weapons; 12 paintable shapes). 36 material-layer PNGs. No arena/FX, UI/brand, audio, shields or drones in this first incremental part handoff.

## Geometry / assembly (provisional, measured from this master)
- Export scale 1; XY origin top-left, +X right, +Y down; clockwise positive angles; all dimensions and colours provisional for integration. Source assembly canvas 640×640. No atlas, memory, maximum-resolution or performance budget is approved by these choices.
- Each **local tile has its own width/height**. The common source assembly and coordinate convention are shared; tiles are NOT all full-size character canvases. Use declared local pivot/socket positions; do not infer joints from opaque bounds or trim padding without updating coordinates.
- Torso root pivot at `[310,276]` on the 640×640 canvas. Every other child aligns its pivot to the named parent socket, then applies its default `angle` plus pose delta around that pivot.
- Column-vector equation: `M_child = M_parent × Translate(parent_socket) × Rotate(default_angle + pose_delta) × Translate(-child_pivot)`. Root: `Translate(root_position + root_delta) × Rotate(root_angle) × Translate(-torso_pivot)`.
- `l` = view-left/rear, `r` = view-right/front, **not anatomical labels**. Mirror whole hierarchy (including weapon) for opponent. Screen transform `Translate(640,0) × Scale(-1,1)`; equivalent x'=640-x. Do not flip each tile independently. All decorative details mirror, including chest vents; no text is baked into game parts.
- Sort by ascending `z`, stable order for any ties. Upper rear arm behind torso, head above torso, front arm in front; weapon z85, front gripping hand z90. Hidden material overlap at every declared moving joint. Layer order is fixed for this tested pose family; arbitrary rotations/crossovers are not proven.
- Sword/axe/dagger all have local grip `[60,163]`. Mount to `hand_r.grip=[60,61.6]`, rotating weapon **180 degrees** relative to the hand local frame. This is essential: 0 degrees puts the blade backwards. Layer hand over handle. Weapon default `angle` is not an additional rotation.
- `motion_bounds` are inclusive **absolute relative-joint angles** (default+delta), not a promise every arbitrary combination within those ranges is collision-free. Torso window covers root tilt. Root translation is sketch-only. Pose timings in GIF are illustrative, not approved combat timings.

## Paint: do not tint complete sprites
All images use straight/unassociated RGBA, transparent background, sRGB colour values. Composite identically sized local tiles in this exact order:
1. `materials/{id}-under.png`: steel/frame, handles and structural materials.
2. `masks/{id}-paint.png`: **use its alpha only**, colourise to selected paint token. White RGB is not a shader instruction. Empty mask = nonpaintable asset.
3. `materials/{id}-over.png`: outlines, black/white translucent cel shading, rivets, face, eyes, metal details and wear.

This derives both sample paints from the same geometry while keeping steel/linework/shading intact. Precomposited `parts/{id}-{paint}.png` are fallback/reference renders, not the only customisation path. No linear tint over the full sprite. Renderer should premultiply only as required by its image API; don't double-premultiply exports. Bilinear/cubic filtering may produce edge differences; validate actual phone fringes on cream/dark backgrounds.

Final paint tokens: Oxide `#E8771C`, Petrol `#27877B` (brand FINAL, UI/UX 2026-11-09). No broad palette or decal system is proven.

## Reproduce / verify
Python 3 with CairoSVG, Pillow and NumPy:
```
python3 source/build_kit.py
python3 source/validate_kit.py
```
Build regenerates the unsealed manifest. Distribution final inventory is sealed separately in `manifest.json` and `SHA256SUMS`; rebuild into a new working directory/version if preserving an already delivered immutable pack. No network, paid APIs, repo or canonical-guide edits.

## Known gaps / honest quality boundary
- Faithful identity cues retained: cap-like angled helmet, rectangular dark face and yellow vertical eyes, round ear, slotted orange chest, chrome piston skeleton, separated angular armour, chunky hands/boots. This is a **clean vector reconstruction**, visibly flatter/less irregular than the selected hand-painted reference, and its integrated likeness and material finish still need independent art review. It must not be presented as approved likeness.
- The raster motion proof establishes local reassembly and attachment only. Foot planting, floor contact/shadows, convincing weight, depth/staggered camera, impact timing, anatomical crossover occlusion and body/weapon self-intersection still need engineering/art iteration. Defeat is a transform sketch, not a finished fallen animation. Socket continuity does not prove zero clipping between unrelated parts.
- No real server replay or stable/customisation/fight screen integration, Android release build, loading/cache/atlas measurement, frame-time or native performance evidence. Engineering owns these tests. Reduced-motion/outcome-driven playback remains to implement.
- Quiet raised arena and essential FX follow this part-kit handoff, not included or claimed completed. Shield/drone/decal entries are reserved notes only, not working compatible assets or new mechanics.
- Source references supplied by Carlos establish direction, not commercial rights. See `PROVENANCE.md`.

## Reconcile with Engineering F7 (read-only contract consulted)
The shared overnight contract declares the existing public component props:
`BotAssembler({ loadout, facing, paintId, weaponId, motionPose?, reducedMotion?, placeholder? })`.
This pack **does not define a replacement component or change those props**. Exact TypeScript/union values live in the F7 PR and were not available in the shared contract. Engineering maps this media schema behind the existing component:
- Pack paint IDs are stable lowercase `oxide`, `petrol`; weapon IDs are `sword`, `axe`, `dagger`, mapped to `weapon_sword`, `weapon_axe`, `weapon_dagger` media IDs. Display labels Oxide/Petrol are separate from IDs. If F7 already has different canonical union IDs, use an explicit adapter mapping rather than changing app/database IDs to these.
- `loadout`: remains F7/server configuration, not replaced with these manifest coordinates; resolve compatible family `workshop-frame-v002` and media refs from the confirmed or intentionally pending loadout.
- `facing`: maps the existing F7 facing type to this pack's canonical right-facing hierarchy or whole-hierarchy reflection; this pack does not invent the type's literal values.
- `motionPose`: map existing F7 pose names to this pack's documented pose deltas; local names are examples, not new combat events. Do not infer fight outcomes from a pose. Bind playback to authoritative stored events.
- `reducedMotion`: skip transform tweening; present a stable assembled pose and existing explicit outcome UI. No sound-only feedback.
- `placeholder`: retain existing fallback while media is absent or incompatible. Setting false is not art/performance acceptance. F6 handles pack loading/cache/integrity; this deliverable is a local media pack, not an already uploaded Supabase pack.
- Shared contract supplied no numeric geometry or loader manifest schema. This JSON is therefore a **measured proposed media-adapter contract**, not asserted F6/F7 wire compatibility. Reuse the F7 renderer; do not fork one per screen.


## v002 review status and v001 integration delta
UI’s delta review cleared the v002 silhouette/head/sword enough for **provisional propagation**, not final user, art, rig, runtime or performance acceptance. This complete v002 keeps those silhouettes and adds restrained bevel/side planes and contact darkening on existing chest/arm geometry. No texture noise or rig redesign.

See `integration-delta-v001-to-v002.json` and `INTEGRATION-DELTA.md` before loading. Slot names, IDs, hierarchy, angles, paint IDs and schema remain unchanged except compatible family/version now `workshop-frame-v002`/`v002`. Coordinates are NOT interchangeable between versions. Head pivot and many child sockets changed; both foot tiles widened to 150 pixels for transparent padding. Treat the kit/manifest as an atomic versioned set; never mix v001 limbs with v002 geometry.
