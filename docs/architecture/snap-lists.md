# Snap lists (E6) — item size + snap interval for A6

Shared horizontal carousel and vertical list primitives live under
`apps/game/src/garage-tag/snap/`. Design SoT:

- [D5 Ludus bot carousel](https://app.clickup.com/t/1amjtrezebp) — one full-width card
- [D7 Customise paints + weapons](https://app.clickup.com/t/1amjtrezebt) — 3 tiles in 358pt
- [D8 Opponents list](https://app.clickup.com/t/1amjtrezebu) — 3×175pt cards

Phone reference frame: **390×844**. At rest, a partial item must never be
visible (first, middle, and last snap positions included). Reduced motion still
snaps to a whole item; programmatic flings skip animation decoration.

## Customise carousel (A6 tile grid)

Export: `CUSTOMISE_CAROUSEL` / `customiseCarouselSnapInterval()` from
`@botore/game` garage-tag (`apps/game/src/garage-tag/snap/snapMetrics.ts`).

| Metric | Value (pt) | Notes |
| --- | ---: | --- |
| `tileWidth` | **105** | Author A6 carousel tiles to this width |
| `tileHeight` | **134** | Card art height |
| `gap` | **11** | Space between tiles |
| **snap interval** | **116** | `tileWidth + gap` — snap stop distance |
| `sidePadding` | **10.5** | Exact-fit inset so 3 tiles fill the 358pt track |
| `trackWidth` | **358** | Design track on 390×844 |
| `visibleCount` | **3** | Whole tiles at rest on the design track |

Check: `3 × 105 + 2 × 11 + 2 × 10.5 = 358`.

On wider phones the strip measures its viewport and keeps **whole** tiles only
(visible count may rise; tiles are never cut). Consumers today:
`PartPickerStrip` on Customise paints + weapons.

## Ludus bot carousel (D5)

| Metric | Value (pt) |
| --- | ---: |
| `cardWidth` | **358** |
| `cardHeight` | **462** |
| `gap` | **0** |
| **snap interval** | **358** |
| `visibleCount` | **1** |

One card at a time; page dots / chevrons land with the D5 UI ticket. Primitive:
`SnapCarousel` with these metrics.

## Opponents vertical list (D8)

| Metric | Value (pt) |
| --- | ---: |
| `cardHeight` | **175** |
| `gap` | **0** |
| **snap interval** | **175** |
| `visibleCount` | **3** |

On 390×844, three cards fit between the quota panel and Continue. Hint line
`1–3 of n` is driven from the snap index. Primitive: `SnapVerticalList`.

## Primitives

- `SnapCarousel` — horizontal `FlatList`, `snapToInterval`,
  `disableIntervalMomentum`, `decelerationRate="fast"`.
- `SnapVerticalList` — same contract on the vertical axis.
- Both expose `scrollToIndex` / `getSnapIndex` via ref and `onSnapIndexChange`.

Do not re-implement snap math per screen. Visual card content (Ludus bot art,
opponent Botore/record layout, A6 pattern swatches) follows the matching UI /
art tickets; this doc owns the **grid** those assets snap on.
