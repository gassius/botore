# Botore / repair-yard environment-v001

Actual PNG/SVG environment and event-FX pack for the overnight mobile concept. **Provisional integration art, not final visual/camera/native acceptance.** No paid generation. No robot, text, label, health bar, control or fight outcome is baked into any `background/` or `fx/` asset. Documentation previews separately combine the real immutable Workshop Frame kit-v002.

## Inspect first
- `previews/scene-phone-360x560.png`: half-size mobile-artwork visibility check, actual kit-v002 lower-left Oxide/sword and higher-right Petrol/axe.
- `previews/scene-staggered-start.png`: full-resolution illustrative start composition.
- `previews/environment-composite.png`: clean environment-only composite.
- `previews/scene-approach-framing.png`: same loadouts, closer positions; framing sketch only, no asserted hit/damage/outcome.
- `previews/scene-play-region-notes.png`: documentation overlay identifying proposed artwork envelope, bounds and contact volume. **Do not ship this overlay as a game background.** These are not native OS safe-area insets.
- `previews/fx-frame-contact-sheet.png`, `previews/fx-phone-visibility.png`: FX over actual floor colour, documentation labels only.

## Actual assets (13 PNGs, 13 editable SVG sources)
Four independently usable environment layers:
1. `background/repair-yard-wall.png` — 720×1120 full scene canvas; wall/pipe/frame opaque at the top, transparent below y384. Muted illustrated graphite/taupe panels and restrained hazard band.
2. `background/repair-yard-floor.png` — same canvas; transparent above the floor horizon, opaque below y366. Broad warm-grey floor masses and sparse low-contrast slab seams/scuffs.
3. `background/repair-yard-floor-markings.png` — same canvas; optional transparent decorative trapezoid. Not movement bounds, hit boxes or collision rules.
4. `background/contact-shadow.png` — 256×96 transparent local tile, pivot [128,48]. Layered soft-edged dark ellipse, independent of robot paint. Grounding aid, not physical light/collision simulation.

Nine local transparent FX frames:
- `fx/hit-spark-00.png` through `02.png`: 192×192, pivot [96,96], restrained gold/cream outlined spark.
- `fx/dodge-dust-00.png` through `02.png`: 224×112, ground pivot [112,80], directional dust/trails pointing to local left.
- `fx/defeat-dust-00.png` through `02.png`: 256×128, ground pivot [128,96], low lateral dust billow.

All material/background/FX SVG geometry is editable under `source/`. No fonts or reference raster images are embedded in assets. Warm neutrals, sparse contour/detail and flat cel shapes follow REF-03's illustrated repair yard; no photorealistic treatment or texture noise.

## Proposed measured scene contract
- Artwork canvas **720×1120 portrait is a candidate**, not approved phone/UI dimensions, export/texture/memory budgets or a calibrated camera. Fit the entire environment and robot hierarchy to one shared uniform scene transform inside Engineering's replay-art viewport; do not independently stretch the floor and bots.
- Top-left XY pixels; +X right, +Y down; straight/unassociated RGBA PNG, sRGB colour values. Wall/floor intentionally have opaque regions. Transparent assets have clean alpha, not a baked checkerboard. Renderer performs only the premultiplication required by its API.
- Layering: wall 0 → floor 10 → optional markings 20 → contact shadows 30 → far actor 40 → dodge ground FX 45 → near actor 50 → defeat ground FX 55 → hit spark 80. These are **proposed presentation layers**, not changes to F7's internal robot-part z-order. Dynamic actor-depth crossover and replay-event attachment remain Engineering work.
- Horizon y366. Illustrative artwork play envelope [16,402,704,1098]. Exact measured actor origins, scales, local ground points, ground anchors, image bounds and shadow transforms are in `manifest.json`. The floor art supports staggered start plus the documented approach positions. No movement mechanics are implied.
- Start: near-left Oxide/sword scale .78, ground anchor [224,990]; far-right mirrored Petrol/axe scale .70, anchor [516,815]. Ground anchor refers to the midpoint between soles, not F7 torso pivot. The source kit's canonical local ground point [317.5,495] mirrors to [322.5,495].
- Kit canvas placement: `origin = sceneGroundAnchor − localGroundAnchor × scale`. For mirrored opponent, mirror the **entire existing kit hierarchy** first (x'=640−x), not each image independently. F7's public props/types are untouched; these scene coordinates are adapter proposals, not a new component API.
- Contact shadow: declared pivot placed at [groundX,groundY−3], with the per-actor independent X/Y scale in the manifest. Use kit and environment manifests atomically per version. A pose that changes sole position may need Engineering-controlled shadow/ground adaptation; the shadow should not rotate with the torso.
- Approach preview anchors: near [270,990], far [508,875], preserving scale, paints, weapons and facing. Existing poses/these illustrative placements were checked for canvas/play-envelope bounds, **not body/weapon collision or convincing physical contact**.
- Keep near fighter lower/larger and the opponent higher/farther; don't flatten them into equal-depth starts. Do not use paint alone for player ownership (the app's existing labels/position/shape cues remain UI responsibility).

## Event FX use — no invented outcomes or final timings
FX are small local transparent frames with declared pivots and bounds, not full-screen overlays. Attach the hit pivot to the renderer/replay contact point. Attach dust to the ground, not torso. For dodge, the tail goes opposite recorded movement; mirror its local X as needed based on that motion, not just bot paint/facing. A left-pointing tail is not a new movement command.

The frame indices are editable shape progression/expansion/fade samples. **No frame duration, interpolation, loop, number of repetitions, quick/heavy hit schedule or final FX size is approved.** Bind one-shot playback to the actual corresponding recorded hit/dodge/defeat; never compute success, damage, health, XP or rewards from art. No sound dependency. Keep effects below/away from faces, controls and authoritative result UI. Hit scale and impact event rate need phone proof; do not blanket the fighter with full-size sparks. Reduced-motion playback can use one restrained static accent or skip tweening while keeping existing explicit event/outcome cues.

## Validation / reproducibility
`validation/report.json` records dimensions, alpha/borders, full wall+floor coverage with no seam gaps, half-scale FX pixel visibility and actual kit pose-framing checks for both start/approach placements. It also verifies predecessor kit-v001, kit-v002 and candidate hashes remain unchanged.

```
python3 source/build_environment.py
python3 source/validate_environment.py
```
Python 3, CairoSVG, Pillow and NumPy required. Rebuilding documentation composites additionally requires the immutable sibling `kit-v002/`; those robot assets are not duplicated into this environment archive. The implementation pack remains usable without rebuilding previews. Build into a new version after publication: `manifest.json` is sealed with actual file hashes; `SHA256SUMS` also covers the manifest. See `PROVENANCE.md` for source/ref hashes and rights uncertainty.

## Known boundaries
Quiet vector reconstruction is cleaner/flatter than the supplied painterly reference. Candidate illustration/framing and the final integrated likeness still require UI/Carlos review. Half-scale preview visibility tests are not an accessibility contrast certification. No live replay or native phone build, actual device crop/safe areas, frame-time, GPU/memory/cache/loading budget, collision clearance, convincing weight/foot planting or final animation timing was measured. No generic camera, full arena catalogue, audio, UI/brand, game mechanics or event outcomes were added.
