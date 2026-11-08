import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import {
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  garageTag,
} from '../../garage-tag';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/** Route slot: FightResult — F10 owns result domain; XP is PLACEHOLDER. */
export function FightResultSlot(): React.ReactElement {
  const { goTo, goNext, demoPaintId, demoWeaponId } = useFirstRun();

  return (
    <ScreenChrome
      testID="slot-result"
      footer={
        <>
          <PrimaryButton label="Back to stable" onPress={() => goTo('Stable')} testID="result-stable" />
          <SecondaryButton label="Watch again" onPress={() => goTo('Replay')} testID="result-watch" />
          <SecondaryButton label="Ranking" onPress={goNext} testID="result-ranking" />
        </>
      }
    >
      <ScreenHeader title="Fight Result" />
      <View style={styles.banner}>
        <Text style={styles.bannerText} allowFontScaling>
          Victory
        </Text>
      </View>
      <BotAssemblerSlot
        loadout={{ paintId: demoPaintId, weaponId: demoWeaponId }}
        label="Result pose"
        testID="result-bot"
      />
      <View style={styles.info}>
        <Text style={styles.line} allowFontScaling>
          Rivet defeated Bolt
        </Text>
        <Text style={styles.xp} allowFontScaling>
          XP: PLACEHOLDER — bind authoritative backend value (F10)
        </Text>
      </View>
      <DomainNote text="Domain: F10 fight result. Sample +2 XP from REF is not a product rule." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  banner: {
    alignSelf: 'center',
    backgroundColor: garageTag.mustard,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    paddingHorizontal: 28,
    paddingVertical: 12,
  },
  bannerText: {
    fontWeight: '900',
    fontSize: 22,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  info: {
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    padding: 14,
    gap: 8,
    alignItems: 'center',
  },
  line: {
    fontWeight: '800',
    fontSize: 15,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
  },
  xp: {
    fontWeight: '700',
    fontSize: 13,
    color: garageTag.steel,
    textAlign: 'center',
  },
});
