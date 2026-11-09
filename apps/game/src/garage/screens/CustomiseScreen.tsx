import React, { useState } from 'react';
import { Text, StyleSheet, View } from 'react-native';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
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
import {
  paintCatalogueId,
  paintUiAlias,
  weaponCatalogueId,
  weaponUiAlias,
} from '../loadout/proofCatalogue';
import { useGarageSession } from '../LoadoutSessionContext';

type CustomiseTab = 'paint' | 'weapon';

/** Customisation domain — mounts into shell Customise slot. */
export function CustomiseScreen(props: {
  onBack: () => void;
  onSaved?: () => void;
}): React.ReactElement {
  const { loadout, canProgress, selectPaint, selectWeapon, discard, save, retryHydration } =
    useGarageSession();
  const [tab, setTab] = useState<CustomiseTab>('paint');
  const preview = loadout.pendingLoadout;
  const editingLocked = loadout.saving || loadout.hydration !== 'ready';
  const previewWeapon = preview ? weaponUiAlias(preview.weapon) : 'sword';
  const previewPaint = preview ? paintUiAlias(preview.paint) : 'oxide';

  const onBack = () => {
    if (loadout.saving) return;
    if (loadout.dirty) discard();
    props.onBack();
  };

  const onSave = async () => {
    const ok = await save();
    if (ok) props.onSaved?.();
  };

  if (!canProgress || !preview || !loadout.confirmedLoadout) {
    return (
      <ScreenChrome
        testID="slot-customise"
        footer={
          <>
            <SecondaryButton
              label="Retry load"
              onPress={() => {
                void retryHydration();
              }}
              testID="customise-retry-hydration"
            />
            <SecondaryButton label="Back" onPress={props.onBack} testID="customise-back-blocked" />
          </>
        }
      >
        <ScreenHeader title="Customise" onBack={props.onBack} />
        <StatusErrorBanner
          title="Customisation blocked"
          detail={
            loadout.lastError ??
            'Server-confirmed loadout is unavailable. Edits and save stay blocked until hydration succeeds.'
          }
          testID="customise-hydration-error"
        />
      </ScreenChrome>
    );
  }

  return (
    <ScreenChrome
      testID="slot-customise"
      footer={
        <>
          <SecondaryButton
            label="Discard"
            onPress={discard}
            disabled={!loadout.dirty || editingLocked}
            testID="customise-discard"
          />
          <PrimaryButton
            label={loadout.saving ? 'Saving…' : 'Save loadout'}
            onPress={() => {
              void onSave();
            }}
            disabled={!loadout.dirty || editingLocked}
            testID="customise-save"
          />
        </>
      }
    >
      <ScreenHeader title="Customise" {...(editingLocked ? {} : { onBack })} />

      {loadout.dirty ? (
        <View style={styles.unsaved} accessibilityRole="text">
          <Text style={styles.unsavedTitle} allowFontScaling>
            UNSAVED PREVIEW
          </Text>
          <Text style={styles.unsavedDetail} allowFontScaling>
            Equipped stays on last confirmed until save succeeds.
          </Text>
        </View>
      ) : (
        <Text style={styles.clean} allowFontScaling>
          Preview matches equipped (confirmed).
        </Text>
      )}

      <BotAssemblerSlot
        loadout={{
          chassisId: preview.chassis,
          paintId: preview.paint,
          weaponId: preview.weapon,
        }}
        facing="right"
        paintId={preview.paint}
        weaponId={preview.weapon}
        motionPose="idle"
        label="Customisation preview"
        testID="customise-bot"
      />

      <Text style={styles.confirmed} allowFontScaling>
        Confirmed: {paintUiAlias(loadout.confirmedLoadout.paint)} ·{' '}
        {weaponUiAlias(loadout.confirmedLoadout.weapon)}
        {loadout.confirmedVersionId ? ` · ${loadout.confirmedVersionId.slice(0, 8)}…` : ''}
      </Text>

      <TabBar
        tabs={[
          { id: 'paint', label: 'Paint' },
          { id: 'weapon', label: 'Weapon' },
        ]}
        selectedId={tab}
        onSelect={(id) => {
          if (!editingLocked) setTab(id as CustomiseTab);
        }}
        testID="customise-tabs"
      />

      {tab === 'paint' ? (
        <View style={styles.row}>
          <PaintSwatch
            id="oxide"
            label="Oxide"
            color={garageTag.oxide}
            selected={previewPaint === 'oxide'}
            onPress={() => {
              if (!editingLocked) selectPaint(paintCatalogueId('oxide'));
            }}
          />
          <PaintSwatch
            id="petrol"
            label="Petrol"
            color={garageTag.petrol}
            selected={previewPaint === 'petrol'}
            onPress={() => {
              if (!editingLocked) selectPaint(paintCatalogueId('petrol'));
            }}
          />
        </View>
      ) : (
        <View style={styles.row}>
          {(['sword', 'axe', 'dagger'] as WeaponGlyphId[]).map((id) => (
            <WeaponGlyphSlot
              key={id}
              id={id}
              label={id}
              selected={previewWeapon === id}
              onPress={() => {
                if (!editingLocked) selectWeapon(weaponCatalogueId(id));
              }}
            />
          ))}
        </View>
      )}

      {loadout.saving ? (
        <Text style={styles.clean} allowFontScaling testID="customise-saving-lock">
          Saving… paint and weapon edits are locked until the server responds.
        </Text>
      ) : null}

      {loadout.lastError ? (
        <StatusErrorBanner
          title="Could not save changes."
          detail={loadout.lastError}
          testID="customise-save-error"
        />
      ) : null}
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  unsaved: {
    borderWidth: garageTag.outline,
    borderColor: garageTag.mustard,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    padding: 12,
    gap: 4,
  },
  unsavedTitle: {
    color: garageTag.graphite,
    fontWeight: '900',
    fontSize: 14,
  },
  unsavedDetail: {
    color: garageTag.graphite,
    fontSize: 13,
  },
  clean: {
    color: garageTag.steel,
    fontSize: 13,
  },
  confirmed: {
    fontSize: 12,
    color: garageTag.steel,
  },
  row: {
    flexDirection: 'row',
    gap: 10,
  },
});
