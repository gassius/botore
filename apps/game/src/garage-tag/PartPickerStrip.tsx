import React from 'react';
import {
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { garageTag } from './tokens';
import { weaponGlyphSource, type WeaponGlyphId } from './assets';
import { SelectionCheck } from './SelectionCheck';

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
  readonly style?: StyleProp<ViewStyle>;
  readonly testID?: string;
};

/**
 * D3 horizontal part/weapon card strip (~104×134).
 * Next card peeks at the trailing edge; locked cards are dashed + Coming soon.
 */
export function PartPickerStrip({
  cards,
  onSelect,
  disabled = false,
  style,
  testID,
}: PartPickerStripProps): React.ReactElement {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      style={[styles.strip, style]}
      contentContainerStyle={styles.stripContent}
      testID={testID}
    >
      {cards.map((card) => {
        const locked = card.locked === true;
        const selected = card.selected && !locked;
        return (
          <Pressable
            key={card.id}
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
      })}
    </ScrollView>
  );
}

const CARD_W = 104;
const CARD_H = 134;

const styles = StyleSheet.create({
  strip: {
    flexGrow: 0,
    flexShrink: 0,
  },
  stripContent: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 2,
    paddingVertical: 6,
    paddingRight: 24,
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
    // Soft ink shelf like the mockup card shadow.
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
