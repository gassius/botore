import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  BrandWordmark,
  Nameplate,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  WeaponGlyphSlot,
  garageTag,
  type WeaponGlyphId,
} from '../../garage-tag';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/** Route slot: Stable — F8 owns auth/stable/save domain. */
export function StableSlot(): React.ReactElement {
  const { goTo, demoPaintId, demoWeaponId } = useFirstRun();
  const weapon = demoWeaponId as WeaponGlyphId;

  return (
    <ScreenChrome
      testID="slot-stable"
      footer={
        <>
          <SecondaryButton
            label="Customise"
            onPress={() => goTo('Customise')}
            testID="stable-customise"
          />
          <PrimaryButton
            label="Find opponent"
            onPress={() => goTo('Opponents')}
            testID="stable-find-opponent"
          />
        </>
      }
    >
      <BrandWordmark width={180} />
      <ScreenHeader title="Stable" />
      <Nameplate name="Rivet" badge="You" testID="stable-nameplate" />
      <BotAssemblerSlot
        loadout={{ paintId: demoPaintId, weaponId: demoWeaponId }}
        label="Equipped bot (slot)"
        testID="stable-bot"
      />
      <View style={styles.loadoutRow}>
        <WeaponGlyphSlot
          id={weapon}
          label={weapon}
          selected
          onPress={() => undefined}
          testID="stable-weapon"
        />
        <View style={styles.paintChip}>
          <Text style={styles.paintLabel} allowFontScaling>
            Paint: {demoPaintId}
          </Text>
          <Text style={styles.equipped} allowFontScaling>
            Equipped (shell demo)
          </Text>
        </View>
      </View>
      <DomainNote text="Domain: F8 auth / stable / confirmed loadout. Shell provides route + Garage Tag chrome only." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  loadoutRow: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  paintChip: {
    flex: 1,
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.cream,
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 2,
  },
  paintLabel: {
    fontWeight: '800',
    textTransform: 'uppercase',
    color: garageTag.graphite,
    fontSize: 13,
  },
  equipped: {
    fontSize: 11,
    fontWeight: '700',
    color: garageTag.steel,
    textTransform: 'uppercase',
  },
});
