import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { garageTag } from './tokens';
import { weaponGlyphSource, type WeaponGlyphId } from './assets';
import { SelectionCheck } from './SelectionCheck';
import { SnapCarousel } from './snap/SnapCarousel';
import { CUSTOMISE_CAROUSEL } from './snap/snapMetrics';

export type PartPickerCard = {
  readonly id: string;
  readonly label: string;
  readonly selected: boolean;
  readonly locked?: boolean;
  readonly paintColor?: string;
  readonly weaponGlyph?: WeaponGlyphId;
};

export type PartPickerStripProps = {
  readonly cards: readonly PartPickerCard[];
  readonly onSelect: (id: string) => void;
  readonly disabled?: boolean;
  readonly initialIndex?: number;
  readonly onSnapIndexChange?: ((index: number) => void) | undefined;
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string | undefined;
};

const CARD_W = CUSTOMISE_CAROUSEL.tileWidth;
const CARD_H = CUSTOMISE_CAROUSEL.tileHeight;

/**
 * D7 horizontal part/weapon snap strip (E6 shared carousel).
 * At rest: exactly whole tiles — never a cut option (first / middle / last).
 */
export function PartPickerStrip({
  cards,
  onSelect,
  disabled = false,
  initialIndex = 0,
  onSnapIndexChange,
  style,
  testID,
}: PartPickerStripProps): React.ReactElement {
  return (
    <SnapCarousel
      data={cards}
      itemSize={CARD_W}
      gap={CUSTOMISE_CAROUSEL.gap}
      clipWidth={CUSTOMISE_CAROUSEL.viewportClip}
      sidePadding={0}
      designVisibleCount={CUSTOMISE_CAROUSEL.visibleCount}
      initialIndex={initialIndex}
      onSnapIndexChange={onSnapIndexChange}
      keyExtractor={(card) => card.id}
      style={[styles.strip, style]}
      contentContainerStyle={styles.stripContent}
      testID={testID}
      renderItem={({ item: card }) => {
        const locked = card.locked === true;
        const selected = card.selected && !locked;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected, disabled: locked || disabled }}
            accessibilityLabel={[
              card.label,
              selected ? 'selected' : null,
              locked ? 'coming soon' : null,
            ]
              .filter(Boolean)
              .join(', ')}
            disabled={locked || disabled}
            onPress={() => {
              if (!locked && !disabled) onSelect(card.id);
            }}
            style={[
              styles.card,
              selected ? styles.cardSelected : null,
              locked ? styles.cardLocked : null,
            ]}
            testID={testID ? `${testID}-card-${card.id}` : `part-card-${card.id}`}
          >
            {locked ? (
              <View style={styles.soonBadge} testID={`part-card-soon-${card.id}`}>
                <Text style={styles.soonText} allowFontScaling>
                  Coming soon
                </Text>
              </View>
            ) : null}
            <View style={styles.art}>
              {locked ? (
                <View style={styles.ghost}>
                  <Text style={styles.ghostMark} allowFontScaling>
                    ?
                  </Text>
                </View>
              ) : card.weaponGlyph ? (
                <Image
                  source={weaponGlyphSource(card.weaponGlyph)}
                  style={styles.glyph}
                  resizeMode="contain"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <View
                  style={[
                    styles.paintChip,
                    { backgroundColor: card.paintColor ?? garageTag.steel },
                  ]}
                />
              )}
            </View>
            <Text
              style={[styles.name, locked ? styles.nameLocked : null]}
              numberOfLines={1}
              allowFontScaling
            >
              {card.label}
            </Text>
            <SelectionCheck selected={selected} style={styles.check} />
          </Pressable>
        );
      }}
    />
  );
}

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
    flexShrink: 0,
    height: CARD_H + 12,
  },
  stripContent: {
    paddingVertical: 6,
  },
  card: {
    width: CARD_W,
    height: CARD_H,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: 9,
    backgroundColor: garageTag.white,
    alignItems: 'center',
    paddingTop: 6,
    paddingBottom: 8,
    paddingHorizontal: 6,
    shadowColor: garageTag.graphite,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 1,
    shadowRadius: 0,
    elevation: 3,
  },
  cardSelected: {
    backgroundColor: garageTag.mustard,
  },
  cardLocked: {
    borderStyle: 'dashed',
    borderColor: garageTag.steel,
    backgroundColor: 'transparent',
    shadowOpacity: 0,
    elevation: 0,
  },
  art: {
    height: 98,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  glyph: {
    width: 72,
    height: 72,
    transform: [{ rotate: '35deg' }],
  },
  paintChip: {
    width: 56,
    height: 56,
    borderRadius: 8,
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
  },
  ghost: {
    width: 54,
    height: 54,
    borderRadius: 27,
    borderWidth: 2.5,
    borderStyle: 'dashed',
    borderColor: garageTag.steel,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostMark: {
    color: garageTag.steel,
    fontWeight: '900',
    fontSize: 26,
  },
  name: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  nameLocked: {
    color: garageTag.steel,
  },
  check: {
    position: 'absolute',
    right: -9,
    top: -9,
  },
  soonBadge: {
    position: 'absolute',
    top: 8,
    zIndex: 1,
    backgroundColor: garageTag.steel,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  soonText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
    color: garageTag.cream,
  },
});
