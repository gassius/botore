# Botore Workshop Frame kit v003.3

Point release on top of v003.2. **No part art changed.** Every v003.1 / v003.2 pose number is unchanged except `poses.knockout` (stagger key of the fall clip) and `poses.follow_through.axe` (visor-clear). Clips are re-baked.

## What is new in v003.3
| Brief item | v003.3 |
|---|---|
| Knockout settle | Floor squash is held 3–4 frames (tiny settle, no pop), then eases over 8–10 frames into the kneel. The **last frame is matrix-identical to the approved v003.1 defeat pose**. The dagger knockout still does not read as a lunge. |
| Dagger thrust | One authored coil→extend in-between was added, and the strike smear is swept from the coil pose so the trail covers the full travel to extension. 0 smear/weapon px on the face. |
| Axe elbows | Recovery through follow-through is continuous. `poses.follow_through.axe` is visor-clear (0 weapon px). Axe dodge and knockout off-hand are relocked to ≤ 0.05 px. Axe attack is 56 frames (v003.2 was 51; cap 56) so basin flips are not fully in-betweened. |
| Angular velocity | Every clip frame is angle-unwrapped. The validator requires ≤ 45°/frame per part, with an explicit exception list (`validation/av-exceptions.json`): the axe attack coil→whip flip (hidden under the whip smear), other smear-covered arm flips, the pendulum→low and overshoot→idle basin changes, the back→rise in-between, and the first two axe hit_react frames. A negative test still catches an unlisted 45°+ spike. |

## Frame counts (30 fps)
| clip | sword | axe | dagger |
|---|---|---|---|
| walk | 24 f · 0.8 s | 32 f · 1.07 s | 16 f · 0.53 s |
| attack | 41 f · 1.37 s | 56 f · 1.87 s | 33 f · 1.1 s |
| dodge | 17 f · 0.57 s | 23 f · 0.77 s | 15 f · 0.5 s |
| hit_react | 21 f · 0.7 s | 19 f · 0.63 s | 19 f · 0.63 s |
| knockout | 46 f · 1.53 s | 49 f · 1.63 s | 44 f · 1.47 s |
| **all clips** | 149 | 179 | 127 |

Contact frames (attack): sword f18, axe f28, dagger f15; hit-stop frames: 3 / 5 / 2.
Full per-frame lists (label, ease, grounded, smear): `animation/TIMING-v003.3.md`.

## How to play (engine)
- `animation/clips.json` → `clips[weaponId][clipName].frames[i]` is a full pose in the usual `{root, parts.rot}` format. Play one per tick at 30 fps; no tween, no IK.
- `meta[i]`: label (`key:*`, `breakdown:*`, `inbetween`, `hit_stop`), ease used, `grounded`.
- `events.contact_frame`: fire the hit sound, start hit-stop on **both** bots (`hit_stop_frames` are already in the attacker's clip; skip them on a miss).
- On `contact_frame` / first strike frame, play the swing sound as already noted by audio; the hit sound goes on the first hit-stop frame.
- Draw `fx` smears at `offset_rig_px`, z 84, on their frame only; mirror with the bot.
- Loop `walk` while translating the bot by `speed_px_per_frame` (rig px) toward the opponent.
- Play `knockout` once; hold `poses.defeat` afterwards (identical matrices to its last frame).

## Layout
- `manifest.json` (v003.3)
- `animation/clips.json`, `animation/TIMING-v003.3.md`
- `fx/smears/`, `fx@2x/smears/`
- `INTEGRATION-DELTA-v003.2-to-v003.3.md` + `.json`
- `README.md`, `PROVENANCE.md`, `SHA256SUMS`
- `previews/` (fight sheets, knockout every-frame strips, smear frames, phone GIF/MP4 and 2x close-ups)
- `previews/v003.1-stills/` (idle / victory / defeat / portraits; those poses did not change)
- `validation/` (report, negative tests, clip solve log, smear report)
- `source/` (full rebuild)

## Rebuild (from `source/`)
1. `python3 clips_v0032.py` (IK solve of every clip frame)
2. `python3 docs_v0032.py` then `python3 build_kit_v0032.py`
3. `python3 previews_v0032.py`
4. `python3 validate_kit_v0032.py ../kit-v003.3`, `python3 negative_test_v0032.py`
5. `python3 delta_v0032.py`, `python3 seal_kit_v0032.py`

Deterministic; no network calls and no paid generations.
