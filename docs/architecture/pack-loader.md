# Client on-demand pack loader (F6)

Expo/React Native foundation for downloading atlas packs by the F5 manifest,
caching them on device, and falling back to the **bundled base pack**.

Acceptance is **Android / iOS**. Web export is a preview only and must not be
treated as acceptance.

## Contracts (from F5)

| Item                          | Role                                          |
| ----------------------------- | --------------------------------------------- |
| `get_atlas_manifest(version)` | Published manifest + `entries[]` for clients  |
| Storage prefix                | `atlas` bucket, object keys `vN/…`            |
| `@botore/contracts`           | `AtlasManifestResponseSchema` wire validation |
| Fight pin                     | `battle_participants.atlas_version`           |

F5 publish pipeline (loader must not invent an alternate path):

1. Register draft (`atlas_versions` + `atlas_manifest_entries`)
2. Upload payloads via Storage API (`scripts/seed-atlas-storage.mjs`)
3. `publish_atlas_version(vN)` (`service_role`, object presence + locks)
4. Clients read published only via `get_atlas_manifest`

The game client **does not** import `@supabase/*`. Networking is injected as a
`PackTransport` (`fetchManifest`, `downloadObject`) so auth/CDN wiring can live
outside this module.

## What ships in the app

Only `apps/game/assets/atlas/base/` (UI / music / generic hit-dodge-defeat
fallbacks). Catalogue `parts/`, `arenas/`, and `fx/` are **not** bundled; the
loader fetches them on demand for the player's stable and current fight.

## Cache behaviour

- Cache root: native `documentDirectory/atlas-cache/packs/<version>/`.
- Same version + complete files → reuse offline (no re-download).
- Version change → new directory → fetch.
- Failed downloads mark the asset `missing` and continue.
- Index commits **merge under a root-keyed exclusive lock** (`canonicalCacheRoot`
  - version) so concurrent same-version loads across **separate store handles**
    sharing one cache directory do not clobber each other's discoverability.
    Publication is staged to `index.json.tmp` then **atomically replaced** via
    `PackFileStore.replaceFile` (rename/move — never truncating in-place writes
    on the live index). A failed replace leaves the previous final readable; a
    complete staged tmp can recover a torn/missing final on the next read.
- Cache index entries persist original F5 `partId` / `role` (no filename reinfer
  on warm/offline hits).
- Cache I/O failures are best-effort: `ensurePacks` still returns bundled base /
  already-resolved assets rather than throwing.

## Transport settle contract

`PackTransport` ops are raced against a **soft settle deadline**
(`DEFAULT_TRANSPORT_TIMEOUT_MS`, overridable via `PackLoaderDeps.transportTimeoutMs`).
This is not a product SLA or cache budget. A never-settling peer unblocks the
loader so bundled / silent fallbacks remain obtainable. Wrong-version manifests
are treated like a failed fetch when `allowOffline: false`.

## Audio never blocks a fight

`resolveAudioCue` / `resolveTriggerAudio`:

1. Prefer a downloaded part clip when a local URI exists.
2. Else use the bundled base-pack role.
3. Else return `silent` (`uri: null`) — playback continues.

## Module map

| Path                                            | Purpose                           |
| ----------------------------------------------- | --------------------------------- |
| `apps/game/src/atlas/pack-loader.ts`            | Orchestrates ensure + cache       |
| `apps/game/src/atlas/pack-cache.ts`             | Versioned index on disk           |
| `apps/game/src/atlas/resolve-audio.ts`          | Non-blocking audio resolution     |
| `apps/game/src/atlas/expo-pack-store.ts`        | `expo-file-system` document cache |
| `apps/game/src/atlas/expo-bundled-base-pack.ts` | Metro + `expo-asset` base wiring  |
| `apps/game/test/atlas-pack-loader.test.ts`      | Headless acceptance for contracts |

## Workshop Frame kit-v002 (C13 / F7 coordination)

Visible build pins **kit-v002 only** — do not mix v001 coords/assets.

Published pack: **`atlas/v2/`** (immutable). Kit local `manifest.json`
(`atlas: null`) is still a **media-adapter** for assembly geometry — not a
second Storage schema. Metro `apps/game/assets/workshop-frame-kit-v002/`
remains a render fallback; `ensurePacks` is the long-term download/cache path
for stable + current fight bots (not the future catalogue).

| Concern                          | Source of truth                                         |
| -------------------------------- | ------------------------------------------------------- |
| Wire / Storage / cache           | F5 `get_atlas_manifest('v2')` + this loader             |
| Fight pin                        | `battle_participants.atlas_version` from sealed loadout |
| Geometry / pivots / paint layers | Kit-v002 media-adapter (F7 consumes)                    |
| Paint aliases Oxide/Petrol       | Client map → `paint-crimson` / `paint-cobalt`           |
| Weapon aliases                   | Kit `weapon_sword` ↔ catalogue/atlas `weapon-sword`     |

Atlas packing recipe (F5 `parts/<partId>/…`, hyphenated partIds):

| Kit-relative               | Atlas pack-relative                 |
| -------------------------- | ----------------------------------- |
| `parts/{id}-{paint}.png`   | `parts/{partId}/{paint}.png`        |
| `materials/{id}-under.png` | `parts/{partId}/material-under.png` |
| `materials/{id}-over.png`  | `parts/{partId}/material-over.png`  |
| `masks/{id}-paint.png`     | `parts/{partId}/mask.png`           |

Helpers: `partIdsForWorkshopFrameLoadout`, `atlasPathForWorkshopKitFile`,
`canonicalAtlasPartId`, `WORKSHOP_FRAME_ATLAS_VERSION`,
`ensureStableFightPacks`, `createRestPackTransport` under
`apps/game/src/atlas/`. Stable hydration and fight selection call
`ensureRuntimePacksBestEffort` (best-effort; never blocks a fight).

Pack bytes: `node scripts/pack-workshop-frame-atlas.mjs` then
`ATLAS_VERSION=v2 node scripts/seed-atlas-storage.mjs`. Hosted upload needs
Carlos credentials — see `supabase/seed/atlas/v2/README.md`.

## Native verification (open in CI/cloud VMs without device)

Unit tests cover cache, version change, bundle-only base pack, silent audio
fallback, workshop-frame path/ID mapping, and stable/fight ensurePacks
selection. Pack script: `node --test scripts/pack-workshop-frame-atlas.test.mjs`.
Device cold-fetch once Storage is available remains an acceptance gate outside
headless CI.
