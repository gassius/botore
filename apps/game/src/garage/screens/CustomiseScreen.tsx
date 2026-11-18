import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { shouldPlayEquipCue, shouldPlaySelectCue } from '../../audio';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import {
  Nameplate,
  PartPickerStrip,
  PrimaryButton,
  SecondaryButton,
  ScreenChrome,
  ScreenHeader,
  StatusErrorBanner,
  TabBar,
  garageTag,
} from '../../garage-tag';
import { playerFacingDisplayName } from '../../identity/platformPlayerId';
import { classifySessionFailure, sessionFailureCopy } from '../../session-failure';
import { SessionFailureBanner } from '../../session-failure/SessionFailureBanner';
import { useFirstRun } from '../../first-run/FirstRunContext';
import { useForcedSessionFailure } from '../../session-failure/useForcedSessionFailure';
import {
  CUSTOMISE_BOT_SIZE,
  CUSTOMISE_SLOTS,
  CUSTOMISE_STAGE_HEIGHT,
  CUSTOMISE_STAGE_MIN_HEIGHT,
  EQUIPPED_CONFIRM_MS,
  buildPaintPickerCards,
  buildWeaponPickerCards,
  pickerMetaLabel,
  type CustomiseSlotId,
} from '../customise/customiseSlots';
import {
  PROOF_PAINTS,
  PROOF_WEAPONS,
  paintCatalogueId,
  paintUiAlias,
  weaponUiAlias,
} from '../loadout/proofCatalogue';
import { useGarageSession } from '../LoadoutSessionContext';
import { isDesignCaptureEnabled } from '../../design-capture';

/** Customisation domain — mounts into shell Customise slot. */
export function CustomiseScreen(props: {
  onBack: () => void;
  onSaved?: () => void;
}): React.ReactElement {
  const {
    loadout,
    canProgress,
    selectPaint,
    selectWeapon,
    discard,
    save,
    retryHydration,
    signOut,
  } = useGarageSession();
  const { muted, musicEnabled, effectsEnabled, customiseCaptureScenario } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const forced = useForcedSessionFailure();
  const [tab, setTab] = useState<CustomiseSlotId>('weapon');
  const [equipFlash, setEquipFlash] = useState(false);
  const equipFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCaptureScenario = useRef<string | null>(null);
  const captureEquipArmed = useRef(false);
  const captureEquipHold = useRef(false);
  const preview = loadout.pendingLoadout;
  const editingLocked = loadout.saving || loadout.hydration !== 'ready';
  const previewWeapon = preview ? weaponUiAlias(preview.weapon) : 'sword';
  const previewPaint = preview ? paintUiAlias(preview.paint) : 'oxide';
  const displayName = playerFacingDisplayName(loadout.displayName ?? 'Bot');

  const clearEquipFlash = () => {
    if (equipFlashTimer.current) {
      clearTimeout(equipFlashTimer.current);
      equipFlashTimer.current = null;
    }
    captureEquipHold.current = false;
    setEquipFlash(false);
  };

  useEffect(() => {
    return () => {
      if (equipFlashTimer.current) clearTimeout(equipFlashTimer.current);
    };
  }, []);

  // End Equipped flash as soon as the player dirties again (show Oxide dot).
  // Capture "equipped" hold skips this so the still stays Equipped.
  useEffect(() => {
    if (loadout.dirty && equipFlash && !captureEquipHold.current) clearEquipFlash();
  }, [loadout.dirty, equipFlash]);

  // D3 native design-capture: drive Paint clean / dirty / Equipped / Weapon soon.
  // Equipped is two-phase: dirty first, then save on the next render (save() reads
  // loadout from context — calling it in the same tick as selectPaint is a no-op).
  useEffect(() => {
    if (!isDesignCaptureEnabled() || !customiseCaptureScenario) return;
    if (loadout.hydration !== 'ready' || !loadout.pendingLoadout || !loadout.confirmedLoadout) {
      return;
    }

    const alternatePaint = (): string => {
      const confirmed = paintUiAlias(loadout.confirmedLoadout!.paint);
      const next = PROOF_PAINTS.find((p) => p.uiAlias !== confirmed) ?? PROOF_PAINTS[1];
      return paintCatalogueId(next.uiAlias);
    };

    if (customiseCaptureScenario === 'equipped' && captureEquipArmed.current) {
      if (lastCaptureScenario.current === 'equipped') return;
      if (!loadout.dirty || loadout.saving) return;
      lastCaptureScenario.current = 'equipped';
      void (async () => {
        const ok = await save();
        if (!ok) {
          // Allow a later dirty tick to retry.
          lastCaptureScenario.current = null;
          return;
        }
        if (equipFlashTimer.current) clearTimeout(equipFlashTimer.current);
        equipFlashTimer.current = null;
        captureEquipHold.current = true;
        setEquipFlash(true);
        console.log('BOTORE_CAPTURE_CUSTOMISE:equipped');
      })();
      return;
    }

    if (lastCaptureScenario.current === customiseCaptureScenario) return;
    captureEquipHold.current = false;
    captureEquipArmed.current = false;

    if (customiseCaptureScenario === 'paint-clean') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      setTab('paint');
      clearEquipFlash();
      console.log('BOTORE_CAPTURE_CUSTOMISE:paint-clean');
      return;
    }
    if (customiseCaptureScenario === 'paint-dirty') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      setTab('paint');
      clearEquipFlash();
      selectPaint(alternatePaint());
      console.log('BOTORE_CAPTURE_CUSTOMISE:paint-dirty');
      return;
    }
    if (customiseCaptureScenario === 'equipped') {
      if (loadout.dirty) discard();
      setTab('paint');
      clearEquipFlash();
      selectPaint(alternatePaint());
      captureEquipArmed.current = true;
      return;
    }
    if (customiseCaptureScenario === 'weapon-soon') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('weapon');
      console.log('BOTORE_CAPTURE_CUSTOMISE:weapon-soon');
    }
  }, [
    customiseCaptureScenario,
    loadout.hydration,
    loadout.pendingLoadout,
    loadout.confirmedLoadout,
    loadout.dirty,
    loadout.saving,
    discard,
    selectPaint,
    save,
  ]);

  const errorKind = loadout.lastError
    ? classifySessionFailure({
        code: loadout.lastErrorCode,
        message: loadout.lastError,
      })
    : null;
  const failureKind =
    forced ?? (errorKind === 'offline' || errorKind === 'auth_expired' ? errorKind : null);

  const tabs = useMemo(
    () =>
      CUSTOMISE_SLOTS.map((slot) => ({
        id: slot.id,
        label: slot.label,
        disabled: !slot.hasContent,
      })),
    [],
  );

  const paintCards = useMemo(() => buildPaintPickerCards(previewPaint), [previewPaint]);
  const weaponCards = useMemo(() => buildWeaponPickerCards(previewWeapon), [previewWeapon]);
  const activeCards = tab === 'paint' ? paintCards : weaponCards;
  const ownedCount = tab === 'paint' ? PROOF_PAINTS.length : PROOF_WEAPONS.length;
  const slotLabel = CUSTOMISE_SLOTS.find((s) => s.id === tab)?.label ?? 'Parts';

  const onBack = () => {
    if (loadout.saving) return;
    if (loadout.dirty) discard();
    props.onBack();
  };

  const onSelectPaint = (paintId: string) => {
    if (editingLocked) return;
    selectPaint(paintId);
    if (shouldPlaySelectCue(true)) uiAudio.playCue('select');
  };

  const onSelectWeapon = (weaponId: string) => {
    if (editingLocked) return;
    selectWeapon(weaponId);
    if (shouldPlaySelectCue(true)) uiAudio.playCue('select');
  };

  const onSelectCard = (cardId: string) => {
    if (tab === 'paint') {
      onSelectPaint(cardId);
      return;
    }
    onSelectWeapon(cardId);
  };

  const flashEquipped = () => {
    if (equipFlashTimer.current) clearTimeout(equipFlashTimer.current);
    setEquipFlash(true);
    equipFlashTimer.current = setTimeout(() => {
      setEquipFlash(false);
      equipFlashTimer.current = null;
    }, EQUIPPED_CONFIRM_MS);
  };

  const onEquip = async () => {
    const ok = await save();
    if (shouldPlayEquipCue(ok)) uiAudio.playCue('equip');
    if (ok) {
      flashEquipped();
      props.onSaved?.();
    }
  };

  const onFailureAction = () => {
    if (failureKind === 'auth_expired') {
      void signOut();
      return;
    }
    if (loadout.hydration !== 'ready') {
      void retryHydration();
      return;
    }
    if (loadout.dirty) {
      void onEquip();
      return;
    }
    // Offline while ready + clean (forced capture, or error after discard):
    // Retry must still do something — re-hydrate from the server.
    void retryHydration();
  };

  if (!canProgress || !preview || !loadout.confirmedLoadout) {
    return (
      <ScreenChrome
        testID="slot-customise"
        scroll={false}
        footer={
          <>
            <SecondaryButton
              label={
                failureKind === 'auth_expired'
                  ? sessionFailureCopy('auth_expired').actionLabel
                  : failureKind === 'offline'
                    ? sessionFailureCopy('offline').actionLabel
                    : 'Retry load'
              }
              onPress={onFailureAction}
              testID="customise-retry-hydration"
            />
            <SecondaryButton label="Back" onPress={props.onBack} testID="customise-back-blocked" />
          </>
        }
      >
        <ScreenHeader title="Customise" onBack={props.onBack} />
        {failureKind ? (
          <SessionFailureBanner
            kind={failureKind}
            {...(loadout.lastError ? { detail: loadout.lastError } : {})}
            testID={`customise-session-${failureKind}`}
          />
        ) : (
          <StatusErrorBanner
            title="Customisation blocked"
            detail={
              loadout.lastError ??
              'Server-confirmed loadout is unavailable. Edits and save stay blocked until hydration succeeds.'
            }
            testID="customise-hydration-error"
          />
        )}
      </ScreenChrome>
    );
  }

  const equipDisabled = !loadout.dirty || editingLocked;
  const equipLabel = equipFlash ? 'Equipped' : 'Equip';

  return (
    <ScreenChrome
      testID="slot-customise"
      scroll={false}
      footer={
        <View style={styles.footerCol} testID="customise-footer">
          <View style={styles.actions} testID="customise-actions">
            <SecondaryButton
              label="Discard"
              onPress={discard}
              disabled={!loadout.dirty || editingLocked}
              style={styles.discard}
              testID="customise-discard"
            />
            <PrimaryButton
              label={equipLabel}
              onPress={() => {
                void onEquip();
              }}
              disabled={equipDisabled}
              busy={loadout.saving}
              showUnsavedDot={loadout.dirty && !loadout.saving}
              style={styles.equip}
              testID="customise-save"
            />
          </View>
          {failureKind ? (
            <SecondaryButton
              label={sessionFailureCopy(failureKind).actionLabel}
              onPress={onFailureAction}
              disabled={loadout.saving}
              testID="customise-session-action"
            />
          ) : null}
        </View>
      }
    >
      <View style={styles.body} testID="customise-body">
        <ScreenHeader title="Customise" {...(editingLocked ? {} : { onBack })} />

        <View style={styles.stage} testID="customise-stage">
          <View style={styles.floor} />
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
            size={CUSTOMISE_BOT_SIZE}
            label="Customisation preview"
            style={styles.hero}
            testID="customise-bot"
          />
          <Nameplate name={displayName} style={styles.nameplate} testID="customise-nameplate" />
        </View>

        <TabBar
          tabs={tabs}
          selectedId={tab}
          compact
          onSelect={(id) => {
            if (!editingLocked) setTab(id as CustomiseSlotId);
          }}
          testID="customise-tabs"
        />

        <View style={styles.pickerMeta} testID="customise-picker-meta">
          <Text style={styles.pickerTitle} allowFontScaling>
            {slotLabel}
          </Text>
          <Text style={styles.pickerHint} allowFontScaling>
            {pickerMetaLabel(tab, ownedCount)}
          </Text>
        </View>

        <PartPickerStrip
          cards={activeCards}
          onSelect={onSelectCard}
          disabled={editingLocked}
          testID="customise-picker"
        />

        {failureKind ? (
          <SessionFailureBanner
            kind={failureKind}
            {...(loadout.lastError ? { detail: loadout.lastError } : {})}
            testID={`customise-session-${failureKind}`}
          />
        ) : loadout.lastError ? (
          <StatusErrorBanner
            title="Could not save changes."
            detail={loadout.lastError}
            testID="customise-save-error"
          />
        ) : null}
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
    minHeight: 0,
    gap: 10,
  },
  stage: {
    flexGrow: 1,
    flexShrink: 1,
    minHeight: CUSTOMISE_STAGE_MIN_HEIGHT,
    maxHeight: CUSTOMISE_STAGE_HEIGHT,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: '#E9D6B3',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  floor: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 86,
    backgroundColor: '#DCC7A1',
    borderTopWidth: 2,
    borderTopColor: '#C7B089',
  },
  hero: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: -8,
    bottom: 48,
    justifyContent: 'center',
  },
  nameplate: {
    marginBottom: 12,
    paddingHorizontal: 22,
    paddingVertical: 5,
    minHeight: 0,
    backgroundColor: garageTag.white,
    zIndex: 2,
  },
  pickerMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 4,
    flexShrink: 0,
  },
  pickerTitle: {
    color: garageTag.graphite,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  pickerHint: {
    color: '#6B6356',
    fontSize: 11,
    fontWeight: '600',
  },
  footerCol: {
    gap: 10,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    alignItems: 'stretch',
  },
  discard: {
    flexGrow: 0,
    flexShrink: 0,
    width: 128,
  },
  equip: {
    flex: 1,
  },
});
