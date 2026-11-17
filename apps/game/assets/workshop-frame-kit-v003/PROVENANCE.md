# Provenance: kit v003.1
- **Author:** Game Art Director (Grok Bot) for Carlos González Rico, 2026-11-17 (Europe/Madrid).
- **Pipeline:** the parts are the kit v003 vector sources (procedural SVG, CairoSVG raster) and are byte-identical to v003. Poses are authored as world targets and solved to baked rotations by least-squares IK (SciPy).
- **Previews:** rendered by the manifest-only assembler (`mfasm.py`). The GIFs and MP4s are made with Pillow and ffmpeg (libx264).
- **Environment:** fight-strip backgrounds use `environment-v001` (Repair Yard).
- **Inputs not used:** no generative-image models, no ElevenLabs, no network fetches, and no third-party art.
- **Test paint:** `#6E8B3D` (Scrap Green) is a QA test paint only. It is not a catalog paint.
