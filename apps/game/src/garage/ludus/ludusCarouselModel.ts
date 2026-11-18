import type { OwnedBotSummary } from '../loadout/loadoutTypes';

/** Pure: Create Bot slot appears while owned < cap. */
export function ludusCarouselShowsCreate(
  bots: readonly OwnedBotSummary[],
  cap: number,
): boolean {
  return bots.length < Math.max(0, cap);
}

export type LudusCarouselItemModel =
  | { readonly kind: 'bot'; readonly bot: OwnedBotSummary }
  | { readonly kind: 'create'; readonly slotNumber: number; readonly cap: number };

export function buildLudusCarouselItems(
  bots: readonly OwnedBotSummary[],
  cap: number,
): LudusCarouselItemModel[] {
  const safeCap = Math.max(0, Math.floor(cap));
  const items: LudusCarouselItemModel[] = bots.map((bot) => ({ kind: 'bot', bot }));
  if (bots.length < safeCap) {
    items.push({ kind: 'create', slotNumber: bots.length + 1, cap: safeCap });
  }
  return items;
}
