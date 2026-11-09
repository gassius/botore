# Provenance / rights / edits

Created 9 November 2026 (Europe/Madrid) as a local first-kit prototype for Carlos’s authorised overnight Botore concept work. Source authority: selected Art Direction v0.3; exact input files and SHA-256 hashes in `source/reference-inventory.json`.

## Inputs used
- REF-02 preparation flow: primary illustrated face/helmet/chest/arm/boot identity and Oxide/Petrol intent.
- REF-03 gameplay/results/ranking: recurring robot identity and readable fight silhouette.
- Original `02-workshop-frame.png`: only right B/Workshop Frame panel considered; left Heavy Plate not used.
- Verified local guide and read-only shared Engineering UI/rig contract consulted. Neither was modified.

## Production method
Original geometric vector reconstruction authored directly as editable SVG paths in `source/build_kit.py`; geometry is shared across all parts, materials and paints. Hidden joint discs, overlap pistons and sockets drawn explicitly rather than hallucinating cutouts from independent images. CairoSVG rasterisation; Pillow compositing/transform-animation; NumPy matrix calculations. No paid image/audio generation, ElevenLabs, external calls or generation models were used; no prompts/model seed exist. No font embedded in game assets; DejaVu Sans was used only for documentation contact-sheet labels, not UI deliverables. Full assembled master plus individual SVGs retained.

Edits during authoring: corrected common weapon rotation to +180 degrees relative to hand; moved rear hand layer in front of legs; shortened exposed neck by adjusting head pivot/neck socket; measured then corrected quick/heavy pose bounds to avoid canvas clipping. Both paints are composites of identical masks and material layers, not regenerated robots. Input images were inspected but not copied as pixels into output art.

## Legal uncertainty
Reference authorship/licensing and underlying rights were not established. Carlos supplied/selected these concepts, which establishes direction but not copyright clearance or commercial redistribution permission. This reconstruction may be derivative of those references; no claim of exclusive ownership, third-party clearance or commercial-ready licence is made. No reference images bundled into the implementation archive; local authoring paths/hashes retained for traceability. Request rights confirmation before external commercial release.

## Acceptance boundary
Prototype likeness and rig have not been independently approved. Source and numbers are provisional; native release/replay integration and phone testing remain Engineering’s responsibility. No repo, ClickUp, canonical guide, cloud store or other agents were changed/messaged.

## v002 propagation
Source geometry carried from local `kit-v002-candidate/source/build_candidate_preview.py`; candidate and immutable v001 left unchanged. Broader chest/shoulders, shorter exposed limbs, heavier hand/boot/forearm masses, boxed head shell, broad sword and guard. Read-only technical review `/workspace/botore-design-critiques/workshop-frame-v002-review.md` informed propagation, not final acceptance. Remaining volume pass adds cel-shaded side planes/bevels clipped to existing paint regions and small wrist contact darkening. All weapons and both paints exported consistently. Axe/dagger keep their original distinct class geometry; no catalogue expansion.
