import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { shouldPlayEquipCue, shouldPlaySelectCue } from '../../audio';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { HEAVIEST_SHAPES, SHAPE_SLOTS, shapePartId } from '../../assembler/shapes';
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
  BOT_DISPLAY_NAME_MAX_LEN,
  BOT_NAME_INPUT_IME_PROPS,
  clampBotNameDraft,
} from '../customise/botNameInput';
import {
  CUSTOMISE_BOT_SIZE,
  CUSTOMISE_SLOTS,
  CUSTOMISE_STAGE_HEIGHT,
  CUSTOMISE_STAGE_MIN_HEIGHT,
  EQUIPPED_CONFIRM_MS,
  buildPaintPickerCards,
  buildShapePickerCards,
  buildWeaponPickerCards,
  isShapeSlot,
  pickerMetaLabel,
  type CustomiseSlotId,
} from '../customise/customiseSlots';
import {
  PROOF_PAINTS,
  PROOF_SHAPES,
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
    selectShape,
    discard,
    save,
    renameDisplayName,
    retryHydration,
    signOut,
  } = useGarageSession();
  const { muted, musicEnabled, effectsEnabled, customiseCaptureScenario } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const forced = useForcedSessionFailure();
  const [tab, setTab] = useState<CustomiseSlotId>('weapon');
  const [equipFlash, setEquipFlash] = useState(false);
  /** D7 nameplate pencil — pending until Equip calls rename_owned_character. */
  const [nameEditing, setNameEditing] = useState(false);
  const [pendingName, setPendingName] = useState(() =>
    playerFacingDisplayName(loadout.displayName ?? 'Bot'),
  );
  const [nameBaseline, setNameBaseline] = useState(() =>
    playerFacingDisplayName(loadout.displayName ?? 'Bot'),
  );
  const equipFlashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCaptureScenario = useRef<string | null>(null);
  const captureEquipArmed = useRef(false);
  const captureEquipHold = useRef(false);
  /** Design-capture: remount strip at a whole snap stop (hazard / unlocked weapons). */
  const [capturePickerIndex, setCapturePickerIndex] = useState(0);
  const preview = loadout.pendingLoadout;
  const editingLocked = loadout.saving || loadout.hydration !== 'ready';
  const previewWeapon = preview ? weaponUiAlias(preview.weapon) : 'sword';
  const previewPaint = preview ? paintUiAlias(preview.paint) : 'oxide';
  const displayName = playerFacingDisplayName(pendingName || 'Bot');
  const nameDirty = pendingName.trim() !== nameBaseline.trim();

  useEffect(() => {
    // Hydration / remote name refresh resets baseline when not dirty-editing.
    if (nameEditing || nameDirty) return;
    const next = playerFacingDisplayName(loadout.displayName ?? 'Bot');
    setPendingName(next);
    setNameBaseline(next);
  }, [loadout.displayName, nameEditing, nameDirty]);

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

    const equipScenario =
      customiseCaptureScenario === 'equipped' || customiseCaptureScenario === 'shape-equipped';
    if (equipScenario && captureEquipArmed.current) {
      if (lastCaptureScenario.current === customiseCaptureScenario) return;
      if (!loadout.dirty || loadout.saving) return;
      lastCaptureScenario.current = customiseCaptureScenario;
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
        console.log(`BOTORE_CAPTURE_CUSTOMISE:${customiseCaptureScenario}`);
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
      setCapturePickerIndex(0);
      clearEquipFlash();
      console.log('BOTORE_CAPTURE_CUSTOMISE:paint-clean');
      return;
    }
    if (customiseCaptureScenario === 'paint-dirty') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      setTab('paint');
      setCapturePickerIndex(0);
      clearEquipFlash();
      selectPaint(alternatePaint());
      console.log('BOTORE_CAPTURE_CUSTOMISE:paint-dirty');
      return;
    }
    if (customiseCaptureScenario === 'equipped') {
      if (loadout.dirty) discard();
      setTab('paint');
      setCapturePickerIndex(0);
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
      setCapturePickerIndex(0);
      console.log('BOTORE_CAPTURE_CUSTOMISE:weapon-soon');
      return;
    }
    if (customiseCaptureScenario === 'paint-hazard') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('paint');
      const hazardIdx = PROOF_PAINTS.findIndex((p) => p.partId === 'paint-hazard');
      setCapturePickerIndex(Math.max(0, hazardIdx));
      selectPaint(paintCatalogueId('hazard'));
      console.log('BOTORE_CAPTURE_CUSTOMISE:paint-hazard');
      return;
    }
    if (customiseCaptureScenario === 'weapon-unlocked') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('weapon');
      // Last whole stop: 7 weapons, 3 visible → max index 4 (hammer/spear/shield).
      // Select mace so an unlocked A4 weapon is equipped on the robot too.
      const maceIdx = PROOF_WEAPONS.findIndex((w) => w.partId === 'weapon-mace');
      const lastStop = Math.max(0, PROOF_WEAPONS.length - 3);
      setCapturePickerIndex(lastStop);
      selectWeapon(PROOF_WEAPONS[Math.max(0, maceIdx)]!.partId);
      console.log('BOTORE_CAPTURE_CUSTOMISE:weapon-unlocked');
      return;
    }
    if (customiseCaptureScenario === 'shape-head-welder') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('head');
      setCapturePickerIndex(0);
      selectShape('head', 'welder');
      console.log('BOTORE_CAPTURE_CUSTOMISE:shape-head-welder');
      return;
    }
    if (customiseCaptureScenario === 'shape-body-boiler') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('body');
      setCapturePickerIndex(0);
      selectShape('body', 'boiler');
      console.log('BOTORE_CAPTURE_CUSTOMISE:shape-body-boiler');
      return;
    }
    if (customiseCaptureScenario === 'shape-heaviest') {
      lastCaptureScenario.current = customiseCaptureScenario;
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('legs');
      setCapturePickerIndex(0);
      for (const slot of SHAPE_SLOTS) selectShape(slot, HEAVIEST_SHAPES[slot]);
      console.log('BOTORE_CAPTURE_CUSTOMISE:shape-heaviest');
      return;
    }
    if (customiseCaptureScenario === 'shape-equipped') {
      if (loadout.dirty) discard();
      clearEquipFlash();
      setTab('body');
      setCapturePickerIndex(0);
      // Equip needs a dirty diff: heaviest unless already confirmed, else stock.
      const confirmed = loadout.confirmedLoadout;
      const heaviestConfirmed = SHAPE_SLOTS.every(
        (slot) => confirmed[slot] === shapePartId(slot, HEAVIEST_SHAPES[slot]),
      );
      for (const slot of SHAPE_SLOTS) {
        selectShape(slot, heaviestConfirmed ? PROOF_SHAPES[slot][0].alias : HEAVIEST_SHAPES[slot]);
      }
      captureEquipArmed.current = true;
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
    selectWeapon,
    selectShape,
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
  const previewShapeId = preview && isShapeSlot(tab) ? preview[tab] : null;
  const shapeCards = useMemo(
    () => (isShapeSlot(tab) && previewShapeId ? buildShapePickerCards(tab, previewShapeId) : []),
    [tab, previewShapeId],
  );
  const activeCards = isShapeSlot(tab) ? shapeCards : tab === 'paint' ? paintCards : weaponCards;
  const ownedCount = isShapeSlot(tab)
    ? PROOF_SHAPES[tab].length
    : tab === 'paint'
      ? PROOF_PAINTS.length
      : PROOF_WEAPONS.length;
  const slotLabel = CUSTOMISE_SLOTS.find((s) => s.id === tab)?.label ?? 'Parts';

  const onBack = () => {
    if (loadout.saving) return;
    uiAudio.playCue('uiBack');
    if (loadout.dirty || nameDirty) onDiscard();
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
    if (isShapeSlot(tab)) {
      if (editingLocked) return;
      selectShape(tab, cardId);
      if (shouldPlaySelectCue(true)) uiAudio.playCue('select');
      return;
    }
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

  const onDiscard = () => {
    discard();
    setPendingName(nameBaseline);
    setNameEditing(false);
  };

  const onEquip = async () => {
    // Nameplate → rename_owned_character; paint/weapon/shapes → save_bot_loadout.
    let ok = true;
    const nextName = playerFacingDisplayName(clampBotNameDraft(pendingName) || 'Bot');
    if (nameDirty) {
      ok = await renameDisplayName(nextName);
    }
    if (ok && loadout.dirty) {
      ok = await save();
    }
    if (shouldPlayEquipCue(ok)) uiAudio.playCue('equip');
    if (ok) {
      setPendingName(nextName);
      setNameBaseline(nextName);
      setNameEditing(false);
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
            <SecondaryButton
              label="Back"
              onPress={() => {
                uiAudio.playCue('uiBack');
                props.onBack();
              }}
              testID="customise-back-blocked"
            />
          </>
        }
      >
        <ScreenHeader
          title="Customise"
          onBack={() => {
            uiAudio.playCue('uiBack');
            props.onBack();
          }}
        />
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

  const equipDisabled = (!loadout.dirty && !nameDirty) || editingLocked;
  const equipLabel = equipFlash ? 'Equipped' : 'Equip';
  const discardDisabled = (!loadout.dirty && !nameDirty) || editingLocked;

  return (
    <ScreenChrome
      testID="slot-customise"
      scroll={false}
      footer={
        <View style={styles.footerCol} testID="customise-footer">
          <View style={styles.actions} testID="customise-actions">
            <SecondaryButton
              label="Discard"
              onPress={() => {
                uiAudio.playCue('uiBack');
                onDiscard();
              }}
              disabled={discardDisabled}
              onDisabledPress={() => uiAudio.playCue('uiError')}
              style={styles.discard}
              testID="customise-discard"
            />
            <PrimaryButton
              label={equipLabel}
              onPress={() => {
                void onEquip();
              }}
              disabled={equipDisabled}
              onDisabledPress={() => uiAudio.playCue('uiError')}
              busy={loadout.saving}
              showUnsavedDot={(loadout.dirty || nameDirty) && !loadout.saving}
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
              head: preview.head,
              body: preview.body,
              arms: preview.arms,
              legs: preview.legs,
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
          <View style={styles.nameplateRow} testID="customise-nameplate-row">
            {nameEditing ? (
              <TextInput
                value={pendingName}
                onChangeText={(text) => setPendingName(clampBotNameDraft(text))}
                maxLength={BOT_DISPLAY_NAME_MAX_LEN}
                autoFocus
                editable={!editingLocked}
                onBlur={() => setNameEditing(false)}
                style={styles.nameInput}
                testID="customise-nameplate-input"
                accessibilityLabel="Bot name"
                {...BOT_NAME_INPUT_IME_PROPS}
              />
            ) : (
              <Nameplate name={displayName} style={styles.nameplate} testID="customise-nameplate" />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Edit name"
              disabled={editingLocked}
              onPress={() => setNameEditing(true)}
              style={styles.nameEdit}
              testID="customise-nameplate-edit"
            >
              <Text style={styles.nameEditMark} allowFontScaling>
                ✎
              </Text>
            </Pressable>
          </View>
        </View>

        <TabBar
          tabs={tabs}
          selectedId={tab}
          compact
          onSelect={(id) => {
            if (editingLocked) {
              uiAudio.playCue('uiError');
              return;
            }
            uiAudio.playCue('uiTab');
            setTab(id as CustomiseSlotId);
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
          key={`customise-picker-${tab}-${capturePickerIndex}-${customiseCaptureScenario ?? 'live'}`}
          cards={activeCards}
          onSelect={onSelectCard}
          disabled={editingLocked}
          initialIndex={capturePickerIndex}
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
  nameplateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    zIndex: 2,
    gap: 6,
  },
  nameplate: {
    marginBottom: 0,
    paddingHorizontal: 22,
    paddingVertical: 5,
    minHeight: 0,
    backgroundColor: garageTag.white,
  },
  // No textTransform here: Android controlled TextInput + textTransform/IME
  // composition duplicates characters after a few keystrokes. Nameplate CSS
  // still uppercases the non-editing display.
  nameInput: {
    minWidth: 140,
    maxWidth: 200,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.white,
    paddingHorizontal: 14,
    paddingVertical: 6,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 1.2,
    color: garageTag.graphite,
    textAlign: 'center',
  },
  nameEdit: {
    minWidth: garageTag.touchFloor,
    minHeight: garageTag.touchFloor,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nameEditMark: {
    fontSize: 18,
    fontWeight: '800',
    color: garageTag.graphite,
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
