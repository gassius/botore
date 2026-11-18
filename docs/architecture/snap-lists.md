# Snap lists (E6) — item size + snap interval for A6

Shared horizontal carousel and vertical list primitives live under
`apps/game/src/garage-tag/snap/`. Design SoT:

- [A6 TILES-SPEC](https://app.clickup.com/t/1amjtreze87) (approved zip `Botore-A6-patterns-tott-v1`)
- [D5 Ludus bot carousel](https://app.clickup.com/t/1amjtrezebp)
- [D7 Customise paints + weapons](https://app.clickup.com/t/1amjtrezebt)
- [D8 Opponents list](https://app.clickup.com/t/1amjtrezebu)

Phone reference frame: **390×844**. At rest, a partial item must never be
visible (first, middle, and last snap positions included). Reduced motion still
snaps to a whole item; programmatic flings skip animation decoration.

## Customise carousel (A6 TILES-SPEC)

Export: `CUSTOMISE_CAROUSEL` / `customiseCarouselSnapInterval()` from
garage-tag (`apps/game/src/garage-tag/snap/snapMetrics.ts`).

| Metric                     |    Value (pt) | Notes                                          |
| -------------------------- | ------------: | ---------------------------------------------- |
| `tileWidth` × `tileHeight` | **105 × 128** | Author A6 `tile-paint` / `tile-weapon` to this |
| `gap`                      |        **11** | Space between tiles                            |
| **snap interval**          |       **116** | `tileWidth + gap`                              |
| `viewportClip`             |       **337** | `3×105 + 2×11` — clipped, `overflow: hidden`   |
| content padding            |         **0** | No pad inside the clip (avoids 4th-tile peek)  |
| `visibleCount`             |         **3** | Whole tiles at every rest stop                 |

Paints (10): content `10×105 + 9×11 = 1149`; max offset `812 = 7×116` → last stop shows tiles 8–10.
Weapons (7): content `7×105 + 6×11 = 801`; max offset `464 = 4×116` → last stop shows tiles 5–7.

Assets: `apps/game/assets/a6-patterns-tott-v1/tiles/` (default/selected/locked @1x/2x/3x).
Map: `apps/game/src/garage-tag/a6Tiles.ts`. Catalogue unlock of all 10+7 is **E7** (stacks on this branch).

## Ludus bot carousel (D5)

| Metric            | Value (pt) |
| ----------------- | ---------: |
| `cardWidth`       |    **358** |
| `cardHeight`      |    **462** |
| `gap`             |      **0** |
| **snap interval** |    **358** |
| `visibleCount`    |      **1** |

## Opponents vertical list (D8 / A6 SCREENS-SPEC)

| Metric            |               Value (pt) |
| ----------------- | -----------------------: |
| `cardHeight`      |                  **175** |
| `gap`             |                   **10** |
| **snap interval** |                  **185** |
| `trackHeight`     | **545** (`3×175 + 2×10`) |
| `visibleCount`    |                    **3** |
| art panel         |            **170 × 169** |
| robot body        |                  **150** |

Panel art: `apps/game/assets/a6-patterns-tott-v1/opponents/` (12 NPCs).

Android design evidence: live-fight still `opponents-snap-rest` (seeded online
roster, not C10 `sessionFailure`). Seed ships three system opponents so the
first rest stop shows three whole cards.

## Primitives

- `SnapCarousel` — horizontal; pass `clipWidth={337}` for Customise.
- `SnapVerticalList` — vertical; `snapToInterval = 185` for Opponents.
- Both: `disableIntervalMomentum`, `decelerationRate="fast"`, ref `scrollToIndex`.

No migrations in this PR. Next free migration number in the wave is **0033** (0031=#81, 0032=#84).
