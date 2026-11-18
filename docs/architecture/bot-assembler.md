# Shared bot assembler (F7)

Client module that turns a loadout into the same visual for stable,
customisation preview, and fight.

## Import

```ts
import { BotAssembler, assembleBot } from '../assembler';
// apps/game/src/assembler
```

Shell / F8 / fight screens must import this module — do not fork a second
renderer. Pack download/cache remains F6.

## Workshop Frame kit (ACTIVE = v003)

Game Art delivered `workshop-frame-v003` (integration prototype, **not** Carlos
likeness / native-perf / replay acceptance). Visible build pins a **coherent
v003** set under `apps/game/assets/workshop-frame-kit-v003/`:

- `manifest.json` + precomposited `parts/{id}-{paint}.png` (runtime)
- `masks/` + `materials/` (under→mask→over layers; includes `hand_*_wrap`)
- `PROVENANCE.md`, `README.md`, integration delta, `SHA256SUMS` (vendored subset)
- `SHA256SUMS.full-kit` keeps the Game Art full-kit seal (source/validation omitted from the app tree)

`workshop-frame-kit-v002/` remains vendored as **history** (not the active pin).
**Never mix v002/v001 tiles or pose numbers with v003** (`must_not_mix_versions`).
Atomic swap only.

`workshopFrameAdapter.ts` maps kit media behind existing
`BotAssemblerProps` — paint aliases `oxide`/`petrol` ↔ catalogue
`paint-crimson`/`paint-cobalt`; weapons `sword`/`axe`/`dagger` ↔
`weapon-*` catalogue ids and `weapon_*` kit assets. No catalogue expansion.

v003 renderer rules (see `INTEGRATION-DELTA-v002-to-v003.md`):

- No hardcoded 180° grip — weapons are normal children of `hand_r.grip` with
  per-weapon `attach_angle` (sword 80, axe 90, dagger −90).
- Always draw `hand_l_wrap` / `hand_r_wrap`; apply `weapons[w].z_overrides`.
- Pose lookup: `poses[poseId][weaponId] ?? poses[poseId]["*"]` (nested format;
  do not port v002 numbers). Attack/dodge/hit are v002 carry-overs pending A2.

- `placeholder={false}` (default): kit-v003 PNGs + measured pivots/sockets.
- `placeholder={true}`: geometric PLACEHOLDER stand-ins.
- Paint path: under→mask-tint→over via kit materials/masks (precomposited
  `parts/{id}-{paint}.png` remain as fallback/reference only).

## Motion poses (C11)

**Product decision:** extend the public `MotionPose` union — do **not** add a
parallel event-driven `kitPoseKey` prop. Stable / Customise / fight keep one
`BotAssembler` API.

| `MotionPose`                        | Kit pose key   | Sealed source                                    |
| ----------------------------------- | -------------- | ------------------------------------------------ |
| `idle` / `dodge` / `hit` / `defeat` | same name      | matching animation commands                      |
| `attack`                            | `quick_attack` | `attack_selected.attack: 'basic'`                |
| `heavy_windup`                      | `heavy_windup` | `attack_selected.attack: 'weapon'` (windup beat) |
| `heavy_attack`                      | `heavy_attack` | `attack_selected.attack: 'weapon'` (strike beat) |

Helpers: `motionPoseFromSealedAttack`, `MOTION_POSE_TO_KIT`. Replay compiles one
sealed weapon attack into windup then strike presentation commands (SFX on
strike only). No new combat-v1 mechanics; outcomes stay on the recorded stream.
Idle stance is **per weapon** in v003. Kit also ships `victory` / `portrait`
poses (not yet on the public `MotionPose` set).

## Caveats

Local validation only. Cleaner/flatter than the selected illustrated
reference. Sketch motion is not approved likeness, combat timing, or phone
replay/performance acceptance. UI/Garage Tag assets stay distinct from this
Game Art kit.
