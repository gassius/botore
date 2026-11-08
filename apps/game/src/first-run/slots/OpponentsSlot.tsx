import React from 'react';
import { Pressable, Text, View, StyleSheet, Image } from 'react-native';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  SelectionCheck,
  garageTag,
  uiKitAssets,
} from '../../garage-tag';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

const CANDIDATES = [
  { id: 'bolt', name: 'Bolt', weapon: 'Axe' },
  { id: 'clank', name: 'Clank', weapon: 'Sword' },
] as const;

/** Route slot: Opponents — F9 owns eligibility + fight request. */
export function OpponentsSlot(): React.ReactElement {
  const { goBack, goNext, demoOpponentId, setDemoOpponentId } = useFirstRun();

  return (
    <ScreenChrome
      testID="slot-opponents"
      footer={
        <PrimaryButton
          label="Continue"
          disabled={!demoOpponentId}
          onPress={goNext}
          testID="opponents-continue"
        />
      }
    >
      <ScreenHeader title="Opponents" onBack={goBack} />
      <View style={styles.list}>
        {CANDIDATES.map((c) => {
          const selected = demoOpponentId === c.id;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={`${c.name}, ${c.weapon}${selected ? ', selected' : ''}`}
              onPress={() => setDemoOpponentId(c.id)}
              style={[styles.card, selected ? styles.cardSelected : null]}
              testID={`opponent-${c.id}`}
            >
              <Image
                source={uiKitAssets.robotHeadSmall}
                style={styles.head}
                resizeMode="contain"
                accessibilityIgnoresInvertColors
              />
              <View style={styles.meta}>
                <Text style={styles.name} numberOfLines={2} allowFontScaling>
                  {c.name}
                </Text>
                <Text style={styles.weapon} allowFontScaling>
                  {c.weapon}
                </Text>
              </View>
              <SelectionCheck selected={selected} />
            </Pressable>
          );
        })}
      </View>
      <DomainNote text="Domain: F9 opponent eligibility + confirm/start request. Names are shell fixtures, not live ranking." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: 12,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 72,
    padding: 12,
    backgroundColor: garageTag.cream,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
  },
  cardSelected: {
    borderWidth: 4,
    borderColor: garageTag.mustard,
  },
  head: {
    width: 48,
    height: 48,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  name: {
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  weapon: {
    fontWeight: '700',
    fontSize: 12,
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
});
