import React, { useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  PaintSwatch,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  TabBar,
  WeaponGlyphSlot,
  garageTag,
  type WeaponGlyphId,
} from '../../garage-tag';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

type TabId = 'paint' | 'weapon';

/**
 * Route slot: Customise — local shell selection UI only.
 * F8 owns pending vs confirmed, server save/error/discard domain.
 */
export function CustomiseSlot(): React.ReactElement {
  const { goBack, goTo, demoPaintId, demoWeaponId, setDemoPaintId, setDemoWeaponId } = useFirstRun();
  const [tab, setTab] = useState<TabId>('paint');
  const [showSaveStub, setShowSaveStub] = useState(false);

  const dirty = false; // Domain F8 owns dirty/pending; shell does not invent save semantics.

  return (
    <ScreenChrome
      testID="slot-customise"
      footer={
        <>
          <SecondaryButton
            label="Discard (slot)"
            onPress={goBack}
            testID="customise-discard"
          />
          <PrimaryButton
            label="Save loadout (stub)"
            onPress={() => {
              // Shell stub only — F8 owns real save; return to Stable slot.
              setShowSaveStub(true);
              goTo('Stable');
            }}
            testID="customise-save"
          />
        </>
      }
    >
      <ScreenHeader title="Customise" onBack={goBack} />
      <Text style={styles.previewTag} allowFontScaling>
        Preview (shell) — not server-confirmed
      </Text>
      <BotAssemblerSlot
        loadout={{ paintId: demoPaintId, weaponId: demoWeaponId }}
        label="Customisation preview"
        testID="customise-bot"
      />
      <TabBar
        tabs={[
          { id: 'paint', label: 'Paint' },
          { id: 'weapon', label: 'Weapon' },
        ]}
        selectedId={tab}
        onSelect={(id) => setTab(id as TabId)}
        testID="customise-tabs"
      />
      {tab === 'paint' ? (
        <View style={styles.row}>
          <PaintSwatch
            id="oxide"
            label="Oxide"
            color={garageTag.oxide}
            selected={demoPaintId === 'oxide'}
            onPress={() => setDemoPaintId('oxide')}
          />
          <PaintSwatch
            id="petrol"
            label="Petrol"
            color={garageTag.petrol}
            selected={demoPaintId === 'petrol'}
            onPress={() => setDemoPaintId('petrol')}
          />
        </View>
      ) : (
        <View style={styles.row}>
          {(['sword', 'axe', 'dagger'] as WeaponGlyphId[]).map((id) => (
            <WeaponGlyphSlot
              key={id}
              id={id}
              label={id}
              selected={demoWeaponId === id}
              onPress={() => setDemoWeaponId(id)}
            />
          ))}
        </View>
      )}
      {showSaveStub ? (
        <StatusErrorBanner
          title="Save is stubbed (shell)"
          detail="F8 owns server save. Equipped confirmation is not claimed here."
        />
      ) : null}
      <DomainNote
        text={`Domain: F8 pending vs confirmed loadout + save/error/discard. dirtyFlag=${String(dirty)} unused by shell.`}
      />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  previewTag: {
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
  },
});
