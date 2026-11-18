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
 * D5 Ludus horizontal snap carousel — one 358×462 card at a time + optional
 * Create slot. Page dots + end chevrons.
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

  useEffect(() => {
    const max = Math.max(0, items.length - 1);
    const next = Math.min(Math.max(0, initialIndex), max);
    setIndex(next);
    carouselRef.current?.scrollToIndex(next, false);
  }, [initialIndex, items.length]);

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

  const atStart = index <= 0;
  const atEnd = index >= items.length - 1;
  const current = items[index];
  const onCreateSlide = current?.kind === 'create';

  return (
    <View style={styles.root} testID={testID ?? 'ludus-bot-carousel'}>
      <View style={styles.track}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Previous bot"
          disabled={atStart}
          onPress={() => {
            if (atStart) return;
            const next = index - 1;
            carouselRef.current?.scrollToIndex(next, true);
            handleSnap(next);
          }}
          style={[styles.chevron, atStart ? styles.chevronDisabled : null]}
          testID="ludus-carousel-prev"
        >
          <Text style={styles.chevronText} allowFontScaling>
            ‹
          </Text>
        </Pressable>

        <SnapCarousel
          ref={carouselRef}
          data={items}
          itemSize={LUDUS_BOT_CAROUSEL.cardWidth}
          gap={LUDUS_BOT_CAROUSEL.gap}
          sidePadding={0}
          designVisibleCount={1}
          initialIndex={index}
          onSnapIndexChange={handleSnap}
          keyExtractor={(item, i) =>
            item.kind === 'bot' ? `bot-${item.bot.characterId}` : `create-${i}`
          }
          renderItem={({ item }) =>
            item.kind === 'bot' ? (
              <LudusBotCard bot={item.bot} />
            ) : (
              <LudusCreateSlotCard
                slotNumber={item.slotNumber}
                cap={item.cap}
                onPress={onCreateBot}
              />
            )
          }
          style={styles.carousel}
          testID="ludus-snap-carousel"
        />

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Next bot"
          disabled={atEnd}
          onPress={() => {
            if (atEnd) return;
            const next = index + 1;
            carouselRef.current?.scrollToIndex(next, true);
            handleSnap(next);
          }}
          style={[styles.chevron, atEnd ? styles.chevronDisabled : null]}
          testID="ludus-carousel-next"
        >
          <Text style={styles.chevronText} allowFontScaling>
            ›
          </Text>
        </Pressable>
      </View>

      <View style={styles.dots} testID="ludus-carousel-dots">
        {items.map((item, i) => (
          <View
            key={item.kind === 'bot' ? item.bot.characterId : 'create'}
            style={[styles.dot, i === index ? styles.dotActive : null]}
          />
        ))}
      </View>

      {/* Expose whether create slide is focused for footer disable wiring. */}
      <View
        testID={onCreateSlide ? 'ludus-on-create-slide' : 'ludus-on-bot-slide'}
        style={styles.srOnly}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    gap: 10,
  },
  track: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  carousel: {
    width: LUDUS_BOT_CAROUSEL.cardWidth,
    height: LUDUS_BOT_CAROUSEL.cardHeight,
  },
  chevron: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 2,
    borderColor: garageTag.graphite,
    backgroundColor: garageTag.paper,
    alignItems: 'center',
    justifyContent: 'center',
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
