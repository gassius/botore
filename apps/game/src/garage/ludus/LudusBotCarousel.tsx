import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../../garage-tag';
import { SnapCarousel, type SnapCarouselHandle, LUDUS_BOT_CAROUSEL } from '../../garage-tag/snap';
import type { OwnedBotSummary } from '../loadout/loadoutTypes';
import { LudusBotCard } from './LudusBotCard';
import { LudusCreateSlotCard } from './LudusCreateSlotCard';
import { buildLudusCarouselItems, type LudusCarouselItemModel } from './ludusCarouselModel';

export type LudusCarouselItem = LudusCarouselItemModel;

export type LudusBotCarouselProps = {
  readonly bots: readonly OwnedBotSummary[];
  readonly cap: number;
  readonly onSelectBot: (characterId: string) => void;
  readonly onCreateBot: () => void;
  readonly onSnap?: (index: number, item: LudusCarouselItem) => void;
  /** Force initial index (design capture: create slot / bot). */
  readonly initialIndex?: number;
  readonly testID?: string;
};

/**
 * D5 Ludus horizontal snap carousel — one 358×400 card at a time + optional
 * Create slot. Page dots sit in the ~16pt gap below the card; chevrons inset
 * over the card edges (art: equal side padding, not flush-left).
 */
export function LudusBotCarousel({
  bots,
  cap,
  onSelectBot,
  onCreateBot,
  onSnap,
  initialIndex = 0,
  testID,
}: LudusBotCarouselProps): React.ReactElement {
  const items = useMemo(() => buildLudusCarouselItems(bots, cap), [bots, cap]);
  const carouselRef = useRef<SnapCarouselHandle>(null);
  const [index, setIndex] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, items.length - 1)),
  );
  const onSnapRef = useRef(onSnap);
  onSnapRef.current = onSnap;

  useEffect(() => {
    const max = Math.max(0, items.length - 1);
    const next = Math.min(Math.max(0, initialIndex), max);
    setIndex(next);
    carouselRef.current?.scrollToIndex(next, false);
    const item = items[next];
    if (item) onSnapRef.current?.(next, item);
  }, [initialIndex, items]);

  const handleSnap = useCallback(
    (next: number) => {
      setIndex(next);
      const item = items[next];
      if (!item) return;
      onSnap?.(next, item);
      if (item.kind === 'bot' && !item.bot.isActive) {
        onSelectBot(item.bot.characterId);
      }
    },
    [items, onSelectBot, onSnap],
  );

  const keyExtractor = useCallback(
    (item: LudusCarouselItem, i: number) =>
      item.kind === 'bot' ? `bot-${item.bot.characterId}` : `create-${i}`,
    [],
  );

  const renderItem = useCallback(
    ({ item }: { item: LudusCarouselItem }) =>
      item.kind === 'bot' ? (
        <LudusBotCard bot={item.bot} />
      ) : (
        <LudusCreateSlotCard slotNumber={item.slotNumber} cap={item.cap} onPress={onCreateBot} />
      ),
    [onCreateBot],
  );

  const atStart = index <= 0;
  const atEnd = index >= items.length - 1;
  const current = items[index];
  const onCreateSlide = current?.kind === 'create';
  const dotsLabel = `Bot ${index + 1} of ${items.length}`;

  return (
    <View style={styles.root} testID={testID ?? 'ludus-bot-carousel'}>
      <View style={styles.stage}>
        <SnapCarousel
          ref={carouselRef}
          data={items}
          itemSize={LUDUS_BOT_CAROUSEL.cardWidth}
          gap={LUDUS_BOT_CAROUSEL.gap}
          sidePadding={0}
          designVisibleCount={1}
          initialIndex={index}
          onSnapIndexChange={handleSnap}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          style={styles.carousel}
          testID="ludus-snap-carousel"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous bot"
          disabled={atStart}
          onPress={() => {
            if (atStart) return;
            // scrollToIndex → emitIndex → onSnapIndexChange → handleSnap (once).
            carouselRef.current?.scrollToIndex(index - 1, true);
          }}
          style={[styles.chevron, styles.chevronLeft, atStart ? styles.chevronDisabled : null]}
          testID="ludus-carousel-prev"
        >
          <Text style={styles.chevronText} allowFontScaling>
            ‹
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next bot"
          disabled={atEnd}
          onPress={() => {
            if (atEnd) return;
            carouselRef.current?.scrollToIndex(index + 1, true);
          }}
          style={[styles.chevron, styles.chevronRight, atEnd ? styles.chevronDisabled : null]}
          testID="ludus-carousel-next"
        >
          <Text style={styles.chevronText} allowFontScaling>
            ›
          </Text>
        </Pressable>
      </View>

      <View
        style={styles.dots}
        testID="ludus-carousel-dots"
        accessible
        accessibilityLabel={dotsLabel}
      >
        {items.map((item, i) => (
          <View
            key={item.kind === 'bot' ? item.bot.characterId : 'create'}
            style={[styles.dot, i === index ? styles.dotActive : null]}
          />
        ))}
      </View>

      <View
        testID={onCreateSlide ? 'ludus-on-create-slide' : 'ludus-on-bot-slide'}
        style={styles.srOnly}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const CHEVRON = 36;
const CHEVRON_INSET = 10;

const styles = StyleSheet.create({
  root: {
    width: '100%',
    alignItems: 'center',
    // Space between card bottom and page dots (dots live in the footer gap).
    gap: 8,
  },
  /** Card centred with equal side insets; chevrons overlay inside card edges. */
  stage: {
    width: LUDUS_BOT_CAROUSEL.cardWidth,
    height: LUDUS_BOT_CAROUSEL.cardHeight,
    alignSelf: 'center',
    position: 'relative',
  },
  carousel: {
    width: LUDUS_BOT_CAROUSEL.cardWidth,
    height: LUDUS_BOT_CAROUSEL.cardHeight,
  },
  chevron: {
    position: 'absolute',
    top: '50%',
    marginTop: -(CHEVRON / 2),
    width: CHEVRON,
    height: CHEVRON,
    borderRadius: CHEVRON / 2,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    backgroundColor: garageTag.paper,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  chevronLeft: {
    left: CHEVRON_INSET,
  },
  chevronRight: {
    right: CHEVRON_INSET,
  },
  chevronDisabled: {
    opacity: 0.35,
  },
  chevronText: {
    fontSize: 22,
    fontWeight: '800',
    color: garageTag.graphite,
    marginTop: -2,
  },
  dots: {
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    minHeight: 10,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: garageTag.paper,
    borderWidth: 1,
    borderColor: garageTag.steel,
  },
  dotActive: {
    width: 22,
    borderRadius: 5,
    backgroundColor: garageTag.graphite,
    borderColor: garageTag.graphite,
  },
  srOnly: {
    width: 0,
    height: 0,
    overflow: 'hidden',
    opacity: 0,
  },
});
