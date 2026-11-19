import React, { memo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { garageTag } from '../../garage-tag';
import { LUDUS_BOT_CAROUSEL } from '../../garage-tag/snap';

export type LudusCreateSlotCardProps = {
  /** 1-based free slot index (e.g. 3 when owned=2, cap=3). */
  readonly slotNumber: number;
  readonly cap: number;
  readonly onPress: () => void;
  readonly testID?: string;
};

/** D5 dashed + CREATE BOT carousel card — shown only while owned < cap. */
function LudusCreateSlotCardImpl({
  slotNumber,
  cap,
  onPress,
  testID,
}: LudusCreateSlotCardProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel="Create bot"
      onPress={onPress}
      style={styles.card}
      testID={testID ?? 'ludus-create-slot'}
    >
      <View style={styles.plusCircle}>
        <Text style={styles.plus} allowFontScaling>
          +
        </Text>
      </View>
      <Text style={styles.title} allowFontScaling>
        Create bot
      </Text>
      <Text style={styles.sub} allowFontScaling testID="ludus-create-slot-sub">
        Slot {slotNumber} of {cap} free
      </Text>
    </Pressable>
  );
}

export const LudusCreateSlotCard = memo(LudusCreateSlotCardImpl);

const styles = StyleSheet.create({
  card: {
    width: LUDUS_BOT_CAROUSEL.cardWidth,
    height: LUDUS_BOT_CAROUSEL.cardHeight,
    borderWidth: 3,
    borderStyle: 'dashed',
    borderColor: garageTag.steel,
    borderRadius: 12,
    backgroundColor: garageTag.cream,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 16,
  },
  plusCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: garageTag.oxide,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    alignItems: 'center',
    justifyContent: 'center',
  },
  plus: {
    fontSize: 42,
    fontWeight: '900',
    color: garageTag.graphite,
    marginTop: -4,
  },
  title: {
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  sub: {
    fontWeight: '700',
    fontSize: 13,
    color: garageTag.steel,
  },
});
