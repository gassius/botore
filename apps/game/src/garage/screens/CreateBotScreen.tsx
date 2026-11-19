import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import { BotAssemblerSlot } from '../../bot/BotAssemblerSlot';
import { peekCaptureIntent } from '../../design-capture/captureIntentState';
import { isDesignCaptureEnabled } from '../../design-capture';
import { useFirstRun } from '../../first-run/FirstRunContext';
import {
  PartPickerStrip,
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  garageTag,
  type PartPickerCard,
} from '../../garage-tag';
import { resolvePaintVisual } from '../../assembler/paints';
import { useGarageSession } from '../LoadoutSessionContext';
import { PROOF_PAINTS, PROOF_WEAPONS } from '../loadout/proofCatalogue';

const NAME_MAX = 12;
/**
 * Art (0bdf0a5): 250pt preview overflowed the phone frame — STARTING WEAPON
 * heading showed with Create flush under it and no weapon tiles (catalogue is
 * fine; layout clipped the strip). Shrink preview + tighten form gaps so paint
 * and weapon strips both sit fully above the footer at rest.
 */
const PREVIEW_HEIGHT = 140;
const BOT_SIZE = 120;

/** D6 starting paints — solids only (A4); hazard/racing stay Customise-only. */
function solidPaintCards(selectedPartId: string): PartPickerCard[] {
  return PROOF_PAINTS.filter((p) => resolvePaintVisual(p.uiAlias).kind === 'solid').map(
    (paint) => ({
      id: paint.partId,
      label: paint.label,
      selected: selectedPartId === paint.partId,
      paintColor: resolvePaintVisual(paint.uiAlias).armourColor,
      paintAlias: paint.uiAlias,
    }),
  );
}

function weaponCards(selectedPartId: string): PartPickerCard[] {
  return PROOF_WEAPONS.map((weapon) => ({
    id: weapon.partId,
    label: weapon.label,
    selected: selectedPartId === weapon.partId,
    weaponGlyph: weapon.uiAlias,
  }));
}

/**
 * D6 Create Bot — preview, editable random name + dice, paint/weapon snap
 * carousels, Create → active → Ludus.
 */
export function CreateBotScreen(props: {
  onCreated: () => void;
  onBack: () => void;
}): React.ReactElement {
  const { ownedBots, botCap, suggestBotName, createOwnedBot } = useGarageSession();
  const { muted, musicEnabled, effectsEnabled } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });

  const [name, setName] = useState('');
  const [paintId, setPaintId] = useState('paint-cobalt');
  const [weaponId, setWeaponId] = useState('weapon-sword');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameReady, setNameReady] = useState(false);

  const createInFlight = useRef(false);
  const createdLatch = useRef(false);
  const mountedRef = useRef(true);

  const ownedCount = ownedBots.length;
  const cap = botCap > 0 ? botCap : 3;
  const nextSlot = ownedCount + 1;
  const atCap = ownedCount >= cap;
  /** Design-capture still: `home=at-cap` forces the blocked Ludus-full copy. */
  const forceAtCapCapture =
    isDesignCaptureEnabled() && peekCaptureIntent().homeScenario === 'at-cap';
  const showAtCap = (atCap || forceAtCapCapture) && !busy && !createdLatch.current;
  const trimmed = name.trim();
  const canCreate = !atCap && !busy && trimmed.length > 0 && trimmed.length <= NAME_MAX;

  const paints = useMemo(() => solidPaintCards(paintId), [paintId]);
  const weapons = useMemo(() => weaponCards(weaponId), [weaponId]);
  const paintInitial = Math.max(
    0,
    paints.findIndex((p) => p.id === paintId),
  );
  const weaponInitial = Math.max(
    0,
    weapons.findIndex((w) => w.id === weaponId),
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const rollName = useCallback(async () => {
    try {
      const suggested = await suggestBotName();
      if (!mountedRef.current) return;
      if (suggested) {
        setName(suggested.slice(0, NAME_MAX));
        setError(null);
        return;
      }
      setName('Rust Baron');
    } catch {
      if (!mountedRef.current) return;
      setName('Rust Baron');
      setError('Could not load a name. Try again.');
    } finally {
      if (mountedRef.current) setNameReady(true);
    }
  }, [suggestBotName]);

  useEffect(() => {
    void rollName();
  }, [rollName]);

  const onCreate = useCallback(async () => {
    if (createInFlight.current || !canCreate) {
      uiAudio.playCue('uiError');
      return;
    }
    createInFlight.current = true;
    setBusy(true);
    setError(null);
    uiAudio.playCue('uiConfirm');
    try {
      const result = await createOwnedBot({
        displayName: trimmed,
        paint: paintId,
        weapon: weaponId,
      });
      if (!result.ok) {
        uiAudio.playCue('uiError');
        if (mountedRef.current) setError(result.message);
        return;
      }
      createdLatch.current = true;
      props.onCreated();
    } catch {
      uiAudio.playCue('uiError');
      if (mountedRef.current) setError('Could not create bot. Try again.');
    } finally {
      createInFlight.current = false;
      if (mountedRef.current) setBusy(false);
    }
  }, [canCreate, createOwnedBot, paintId, props, trimmed, uiAudio, weaponId]);

  if (showAtCap) {
    return (
      <ScreenChrome
        testID="slot-create-bot"
        scroll={false}
        footer={
          <PrimaryButton
            label="Back to Ludus"
            onPress={() => {
              uiAudio.playCue('uiBack');
              props.onBack();
            }}
            testID="create-bot-back-full"
          />
        }
      >
        <ScreenHeader
          title="Create Bot"
          onBack={() => {
            uiAudio.playCue('uiBack');
            props.onBack();
          }}
          testID="create-bot-header"
        />
        <View style={styles.fullBody}>
          <Text style={styles.fullCopy} allowFontScaling testID="create-bot-at-cap">
            Your Ludus is full
          </Text>
        </View>
      </ScreenChrome>
    );
  }

  return (
    <ScreenChrome
      testID="slot-create-bot"
      scroll
      footer={
        <View style={styles.footer}>
          <PrimaryButton
            label={busy ? 'Creating…' : 'Create'}
            onPress={() => {
              void onCreate();
            }}
            disabled={!canCreate}
            busy={busy}
            onDisabledPress={() => uiAudio.playCue('uiError')}
            testID="create-bot-submit"
          />
          <Text style={styles.helper} allowFontScaling testID="create-bot-helper">
            Bot {nextSlot} of {cap} · you can change everything later in Customise
          </Text>
        </View>
      }
    >
      {/* Single child avoids ScreenChrome scrollContent gap:16 stacking that
          pushed the weapon strip under the fold on phone capture stills. */}
      <View style={styles.form}>
        <ScreenHeader
          title="Create Bot"
          onBack={() => {
            uiAudio.playCue('uiBack');
            props.onBack();
          }}
          testID="create-bot-header"
        />

        <View style={styles.preview} testID="create-bot-preview">
          <BotAssemblerSlot
            loadout={{
              chassisId: 'chassis-basic',
              paintId,
              weaponId,
            }}
            facing="right"
            paintId={paintId}
            weaponId={weaponId}
            motionPose="idle"
            size={BOT_SIZE}
            label="New bot preview"
            testID="create-bot-assembler"
          />
        </View>

        <View style={styles.nameBlock}>
          <View style={styles.nameHeader}>
            <Text style={styles.sectionLabel} allowFontScaling>
              Name
            </Text>
            <Text style={styles.nameHint} allowFontScaling>
              Random — tap to edit · {NAME_MAX} max
            </Text>
          </View>
          <View style={styles.nameRow}>
            {!nameReady ? (
              <ActivityIndicator
                color={garageTag.graphite}
                style={styles.nameLoading}
                accessibilityLabel="Loading name"
              />
            ) : (
              <TextInput
                value={name}
                onChangeText={(v) => {
                  setName(v.slice(0, NAME_MAX));
                  setError(null);
                }}
                maxLength={NAME_MAX}
                autoCapitalize="words"
                autoCorrect={false}
                placeholder="Bot name"
                placeholderTextColor={garageTag.steel}
                style={styles.nameInput}
                testID="create-bot-name"
                accessibilityLabel="Bot name"
              />
            )}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Reroll name"
              onPress={() => {
                uiAudio.playUiTap();
                void rollName();
              }}
              style={styles.dice}
              testID="create-bot-reroll"
            >
              <Text style={styles.diceGlyph} allowFontScaling>
                ⚄
              </Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionLabel} allowFontScaling>
            Starting paint
          </Text>
          <PartPickerStrip
            cards={paints}
            initialIndex={paintInitial}
            onSelect={(id) => {
              uiAudio.playCue('uiSnap');
              setPaintId(id);
            }}
            onSnapIndexChange={() => uiAudio.playCue('uiSnap')}
            testID="create-bot-paint-strip"
          />
        </View>

        <View style={styles.section} testID="create-bot-weapon-section">
          <Text style={styles.sectionLabel} allowFontScaling>
            Starting weapon
          </Text>
          <PartPickerStrip
            cards={weapons}
            initialIndex={weaponInitial}
            onSelect={(id) => {
              uiAudio.playCue('uiSnap');
              setWeaponId(id);
            }}
            onSnapIndexChange={() => uiAudio.playCue('uiSnap')}
            testID="create-bot-weapon-strip"
          />
        </View>

        {error ? (
          <Text
            style={styles.error}
            allowFontScaling
            testID="create-bot-error"
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
          >
            {error}
          </Text>
        ) : null}
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: 10,
    paddingBottom: 4,
  },
  preview: {
    height: PREVIEW_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 12,
    backgroundColor: garageTag.paper,
    overflow: 'hidden',
  },
  nameBlock: {
    gap: 6,
  },
  nameHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: 8,
  },
  sectionLabel: {
    fontWeight: '800',
    fontSize: 13,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  nameHint: {
    flexShrink: 1,
    fontWeight: '700',
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  nameRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  nameLoading: {
    flex: 1,
    height: 48,
  },
  nameInput: {
    flex: 1,
    minHeight: 48,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 8,
    backgroundColor: garageTag.cream,
    paddingHorizontal: 12,
    fontWeight: '800',
    fontSize: 16,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  dice: {
    width: 48,
    height: 48,
    borderWidth: 3,
    borderColor: garageTag.graphite,
    borderRadius: 8,
    backgroundColor: garageTag.mustard,
    alignItems: 'center',
    justifyContent: 'center',
  },
  diceGlyph: {
    fontSize: 22,
    color: garageTag.graphite,
  },
  section: {
    gap: 6,
  },
  footer: {
    gap: 8,
  },
  helper: {
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '600',
    color: garageTag.steel,
  },
  error: {
    marginTop: 8,
    textAlign: 'center',
    fontWeight: '700',
    fontSize: 13,
    color: '#B23A2E',
  },
  fullBody: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  fullCopy: {
    fontWeight: '800',
    fontSize: 16,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
});
