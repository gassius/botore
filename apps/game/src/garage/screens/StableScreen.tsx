import React from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  BrandWordmark,
  Nameplate,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  WeaponGlyphSlot,
  garageTag,
} from '../../garage-tag';
import { paintUiAlias, weaponUiAlias } from '../loadout/proofCatalogue';
import { useGarageSession } from '../LoadoutSessionContext';

/** Stable domain — mounts into shell Stable slot; does not own routes. */
export function StableScreen(props: {
  onCustomise: () => void;
  onFindOpponent?: () => void;
}): React.ReactElement {
  const { loadout, signOut } = useGarageSession();
  const confirmed = loadout.confirmedLoadout;
  const weapon = weaponUiAlias(confirmed.weapon);

  return (
    <ScreenChrome
      testID="slot-stable"
      footer={
        <>
          <SecondaryButton
            label="Customise"
            onPress={props.onCustomise}
            testID="stable-customise"
          />
          <PrimaryButton
            label="Find opponent"
            onPress={props.onFindOpponent ?? (() => undefined)}
            disabled={!props.onFindOpponent}
            testID="stable-find-opponent"
          />
          <SecondaryButton
            label="Sign out"
            onPress={() => {
              void signOut();
            }}
            testID="stable-sign-out"
          />
        </>
      }
    >
      <BrandWordmark width={180} />
      <ScreenHeader title="Stable" />
      <Nameplate name="Player Hero" badge="You" testID="stable-nameplate" />
      <Text style={styles.equipped} allowFontScaling>
        EQUIPPED — last server-confirmed loadout
      </Text>
      {/* Single assembler mount: BotAssemblerSlot → F7 apps/game/src/assembler (kit v002 when tip updates). */}
      <BotAssemblerSlot
        loadout={{
          chassisId: confirmed.chassis,
          paintId: confirmed.paint,
          weaponId: confirmed.weapon,
        }}
        facing="right"
        paintId={confirmed.paint}
        weaponId={confirmed.weapon}
        motionPose="idle"
        label="Equipped bot"
        testID="stable-bot"
      />
      <View style={styles.row}>
        <WeaponGlyphSlot
          id={weapon}
          label={weapon}
          selected
          onPress={() => undefined}
          testID="stable-weapon"
        />
        <View style={styles.paintChip}>
          <Text style={styles.paintLabel} allowFontScaling>
            Paint: {paintUiAlias(confirmed.paint)}
          </Text>
          <Text style={styles.paintMeta} allowFontScaling>
            {confirmed.paint}
          </Text>
        </View>
      </View>
      <Text style={styles.note} allowFontScaling>
        Domain F8 · chrome from shell garage-tag · assembler via BotAssemblerSlot (F7 kit v002)
      </Text>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  equipped: {
    alignSelf: 'center',
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.mustard,
  },
  row: {
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
  paintMeta: {
    fontSize: 11,
    fontWeight: '700',
    color: garageTag.steel,
  },
  note: {
    marginTop: 8,
    fontSize: 12,
    color: garageTag.steel,
  },
});
