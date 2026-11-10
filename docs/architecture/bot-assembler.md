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

## Workshop Frame kit (ACTIVE = v002)

Game Art delivered `workshop-frame-v002` (integration prototype, **not** Carlos
likeness / native-perf / replay acceptance). Visible build pins a **coherent
v002** set under `apps/game/assets/workshop-frame-kit-v002/`:

- `manifest.json` + precomposited `parts/{id}-{paint}.png` (runtime)
- `masks/` + `materials/` (under→mask→over layers; live composite still future)
- `PROVENANCE.md`, `README.md`, integration delta, `SHA256SUMS` (vendored subset)
- `SHA256SUMS.full-kit` keeps the Game Art full-kit seal (source/validation omitted from the app tree)

`workshop-frame-kit-v001/` is **removed**. **Never mix stale v001 coordinates
with v002 assets** (`must_not_mix_versions`).

`workshopFrameAdapter.ts` maps kit media behind existing
`BotAssemblerProps` — paint aliases `oxide`/`petrol` ↔ catalogue
`paint-crimson`/`paint-cobalt`; weapons `sword`/`axe`/`dagger` ↔
`weapon-*` catalogue ids and `weapon_*` kit assets. No catalogue expansion.

- `placeholder={false}` (default): kit-v002 PNGs + measured pivots/sockets.
- `placeholder={true}`: geometric PLACEHOLDER stand-ins.
- Paint path: under→mask-tint→over via kit materials/masks (precomposited
  `parts/{id}-{paint}.png` remain as fallback/reference only).

## Motion poses (C11)

**Product decision:** extend the public `MotionPose` union — do **not** add a
parallel event-driven `kitPoseKey` prop. Stable / Customise / fight keep one
`BotAssembler` API.

| `MotionPose` | Kit pose key | Sealed source |
| --- | --- | --- |
| `idle` / `dodge` / `hit` / `defeat` | same name | matching animation commands |
| `attack` | `quick_attack` | `attack_selected.attack: 'basic'` |
| `heavy_windup` | `heavy_windup` | `attack_selected.attack: 'weapon'` (windup beat) |
| `heavy_attack` | `heavy_attack` | `attack_selected.attack: 'weapon'` (strike beat) |

Helpers: `motionPoseFromSealedAttack`, `MOTION_POSE_TO_KIT`. Replay compiles one
sealed weapon attack into windup then strike presentation commands (SFX on
strike only). No new combat-v1 mechanics; outcomes stay on the recorded stream.
`heavy_windup.root_y` is **45** in v002 (geometry note only).

## Caveats

Local validation only. Cleaner/flatter than the selected illustrated
reference. Sketch motion is not approved likeness, combat timing, or phone
replay/performance acceptance. UI/Garage Tag assets stay distinct from this
Game Art kit.
