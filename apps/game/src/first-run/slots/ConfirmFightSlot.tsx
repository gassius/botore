import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import {
  KitArtPlaceholder,
  Nameplate,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  garageTag,
} from '../../garage-tag';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/** Route slot: ConfirmFight — F9 owns cost + start request. */
export function ConfirmFightSlot(): React.ReactElement {
  const { goBack, goNext, demoPaintId, demoWeaponId, demoOpponentId } = useFirstRun();
  const opponentName = demoOpponentId === 'clank' ? 'Clank' : 'Bolt';

  return (
    <ScreenChrome
      testID="slot-confirm"
      footer={<PrimaryButton label="Start fight" onPress={goNext} testID="confirm-start" />}
    >
      <ScreenHeader title="Confirm Fight" onBack={goBack} />
      <KitArtPlaceholder
        label="Quiet raised arena"
        detail="PLACEHOLDER — Game Art arena / staggered start"
        testID="confirm-arena"
      />
      <View style={styles.fighters}>
        <View style={styles.fighter}>
          <BotAssemblerSlot
            loadout={{ paintId: demoPaintId, weaponId: demoWeaponId }}
            stagger="near-low"
            label="You"
            style={styles.bot}
          />
          <Nameplate name="Rivet" badge="You" />
        </View>
        <View style={styles.fighter}>
          <BotAssemblerSlot
            loadout={{ paintId: 'petrol', weaponId: 'axe' }}
            stagger="far-high"
            label={opponentName}
            style={styles.bot}
          />
          <Nameplate name={opponentName} />
        </View>
      </View>
      <Text style={styles.cost} allowFontScaling>
        Cost: PLACEHOLDER — bind authoritative backend value (F9)
      </Text>
      <DomainNote text="Domain: F9 confirm + fight request. Do not treat REF sample costs as product rules." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  fighters: {
    flexDirection: 'row',
    gap: 8,
  },
  fighter: {
    flex: 1,
    gap: 8,
  },
  bot: {
    minHeight: 140,
  },
  cost: {
    textAlign: 'center',
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
