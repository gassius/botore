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
v002** set under `apps/game/assets/workshop-frame-kit-v002/` (manifest +
precomposited `parts/{id}-{paint}.png` + integration delta).

`workshop-frame-kit-v001/` remains **immutable** for history. **Never mix v001
coordinates with v002 assets** (`must_not_mix_versions`).

`workshopFrameAdapter.ts` maps kit media behind existing
`BotAssemblerProps` — paint aliases `oxide`/`petrol` ↔ catalogue
`paint-crimson`/`paint-cobalt`; weapons `sword`/`axe`/`dagger` ↔
`weapon-*` catalogue ids and `weapon_*` kit assets. No catalogue expansion.

- `placeholder={false}` (default): kit-v002 PNGs + measured pivots/sockets.
- `placeholder={true}`: geometric PLACEHOLDER stand-ins.
- Motion: `attack` → kit `quick_attack` (sketch). Heavy poses exist in the kit
  but are not yet on the public `MotionPose` union.
- Paint path: precomposited Oxide/Petrol PNGs (documented kit fallback). Live
  under→mask→over needs Skia or offline bake later.

## Caveats

Local validation only. Cleaner/flatter than the selected illustrated
reference. Sketch motion is not approved likeness, combat timing, or phone
replay/performance acceptance. UI/Garage Tag assets stay distinct from this
Game Art kit.
