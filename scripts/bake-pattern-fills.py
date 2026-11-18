#!/usr/bin/env python3
"""Bake A6 hazard/racing pattern fill PNGs for kit paint masks (main channel).

Pattern parameters come from paints.json — no invented stripe art.
Output: apps/game/assets/a6-paints-v4/pattern-fills/{paint}/{part}.png
Each fill is RGBA: RGB = pattern colours, A = paint-mask alpha.
"""
from __future__ import annotations

import json
import math
import sys
from pathlib import Path

from PIL import Image
import numpy as np

MAIN_PARTS = ("head", "torso", "thigh_l", "thigh_r", "weapon_shield")


def hex_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    return int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16)


def mask_bbox(alpha: np.ndarray) -> tuple[int, int, int, int] | None:
    ys, xs = np.where(alpha > 0)
    if len(xs) == 0:
        return None
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def diagonal_stripes(w, h, bbox, base, stripe, angle_deg, period, stripe_frac):
    out = np.zeros((h, w, 4), dtype=np.uint8)
    if bbox is None:
        return out
    x0, y0, x1, y1 = bbox
    ang = math.radians(angle_deg)
    # Phase anchored to mask bbox top-left (A6 paints.json).
    cos_a, sin_a = math.cos(ang), math.sin(ang)
    yy, xx = np.mgrid[0:h, 0:w]
    # Distance along stripe normal relative to bbox origin.
    dx = xx.astype(np.float64) - x0
    dy = yy.astype(np.float64) - y0
    proj = dx * cos_a + dy * sin_a
    phase = np.mod(proj, period) / period
    use_stripe = phase < stripe_frac
    rgb = np.where(use_stripe[..., None], stripe, base)
    out[..., 0:3] = rgb
    return out


def horizontal_band(w, h, bbox, base, stripe, pin, band_frac, pin_px):
    out = np.zeros((h, w, 4), dtype=np.uint8)
    if bbox is None:
        return out
    x0, y0, x1, y1 = bbox
    bh = max(1, y1 - y0)
    y_lo = y0 + band_frac[0] * bh
    y_hi = y0 + band_frac[1] * bh
    yy, xx = np.mgrid[0:h, 0:w]
    in_band = (yy >= y_lo) & (yy < y_hi)
    rgb = np.broadcast_to(base, (h, w, 3)).copy()
    rgb[in_band] = stripe
    # Oxide pin lines at band edges (pin_px_rig thick).
    pin_lo = (yy >= y_lo) & (yy < y_lo + pin_px)
    pin_hi = (yy >= y_hi - pin_px) & (yy < y_hi)
    rgb[pin_lo | pin_hi] = pin
    out[..., 0:3] = rgb
    return out


def bake_one(mask_path: Path, paint: dict, part_id: str, out_path: Path) -> None:
    mask = Image.open(mask_path).convert("RGBA")
    arr = np.array(mask)
    alpha = arr[..., 3]
    # Some masks are white RGB with alpha; others near-white in RGB only.
    if alpha.max() == 0:
        alpha = arr[..., 0]
    bbox = mask_bbox(alpha)
    w, h = mask.size
    pat = paint["pattern"]
    base = np.array(hex_rgb(pat["base"]), dtype=np.uint8)
    stripe = np.array(hex_rgb(pat["stripe"]), dtype=np.uint8)

    if pat["type"] == "diagonal_stripes":
        fill = diagonal_stripes(
            w,
            h,
            bbox,
            base,
            stripe,
            float(pat["angle_deg"]),
            float(pat["period_rig_px"]),
            float(pat["stripe_frac"]),
        )
    elif pat["type"] == "horizontal_band":
        bands = pat["bands_frac_of_mask_bbox"]
        # Prefer exact part id; shape variants (torso-boiler) not wired in stock kit yet.
        band_frac = bands.get(part_id) or bands.get("torso" if part_id == "torso" else part_id)
        if band_frac is None:
            # Fallback: first numeric pair in map
            band_frac = next(v for v in bands.values() if isinstance(v, list))
        pin = np.array(hex_rgb(pat["pin"]), dtype=np.uint8)
        fill = horizontal_band(
            w,
            h,
            bbox,
            base,
            stripe,
            pin,
            band_frac,
            float(pat.get("pin_px_rig", 5)),
        )
    else:
        raise SystemExit(f"unknown pattern type {pat['type']}")

    fill[..., 3] = alpha
    out_path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(fill, "RGBA").save(out_path)


def main() -> None:
    if len(sys.argv) != 4:
        print("usage: bake-pattern-fills.py paints.json kitDir outPaintPack", file=sys.stderr)
        raise SystemExit(2)
    paints_path, kit_dir, out_pack = map(Path, sys.argv[1:])
    paints = json.loads(paints_path.read_text())
    pattern_paints = [p for p in paints["paints"] if p.get("kind") == "pattern"]
    count = 0
    for paint in pattern_paints:
        parts = paint["pattern"]["parts"]
        for part in parts:
            if part not in MAIN_PARTS and not part.startswith("weapon_"):
                continue
            mask = kit_dir / "masks" / f"{part}-paint.png"
            if not mask.exists():
                print(f"skip missing mask {mask}")
                continue
            out = out_pack / "pattern-fills" / paint["id"] / f"{part}.png"
            bake_one(mask, paint, part, out)
            count += 1
            # @2x
            mask2 = kit_dir / "masks@2x" / f"{part}-paint.png"
            if mask2.exists():
                out2 = out_pack / "pattern-fills" / paint["id"] / f"{part}@2x.png"
                bake_one(mask2, paint, part, out2)
                count += 1
    print(f"PATTERN-BAKE-OK fills={count}")


if __name__ == "__main__":
    main()
