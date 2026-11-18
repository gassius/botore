import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSharedTrialAudio } from '../../audio/trialAudioContext';
import { useTrialUiAudio } from '../../audio/useTrialUiAudio';
import {
  BrandWordmark,
  ScreenChrome,
  ScreenHeader,
  SettingsToggleRow,
  garageTag,
} from '../../garage-tag';
import { useFirstRun } from '../FirstRunContext';

/**
 * Settings surface — mute persist, Music/Effects, reduced-motion override.
 * Reachable from Stable Garage Tag chrome; not part of the linear fight flow.
 */
export function SettingsSlot(): React.ReactElement {
  const {
    goBack,
    muted,
    setMuted,
    musicEnabled,
    setMusicEnabled,
    effectsEnabled,
    setEffectsEnabled,
    forceReducedMotion,
    setForceReducedMotion,
    osReducedMotion,
  } = useFirstRun();
  const uiAudio = useTrialUiAudio({ muted, musicEnabled, effectsEnabled });
  const shared = useSharedTrialAudio();

  return (
    <ScreenChrome testID="slot-settings">
      <BrandWordmark width={160} />
      <ScreenHeader
        title="Settings"
        onBack={() => {
          uiAudio.playCue('uiBack');
          goBack();
        }}
        testID="settings-header"
      />

      <Text style={styles.section} allowFontScaling>
        Audio
      </Text>
      <View style={styles.stack}>
        <SettingsToggleRow
          label="Master mute"
          value={muted}
          onValueChange={(next) => {
            setMuted(next);
            shared?.getSession()?.setMuted(next);
            uiAudio.playCue('uiToggle');
          }}
          detail="Persists across launches"
          testID="settings-master-mute"
        />
        <SettingsToggleRow
          label="Music"
          value={musicEnabled}
          onValueChange={(next) => {
            setMusicEnabled(next);
            shared?.getSession()?.setMusicEnabled(next);
            uiAudio.playCue('uiToggle');
          }}
          detail={muted ? 'Master mute silences music' : 'Menu and fight music'}
          testID="settings-music"
        />
        <SettingsToggleRow
          label="Effects"
          value={effectsEnabled}
          onValueChange={(next) => {
            setEffectsEnabled(next);
            shared?.getSession()?.setEffectsEnabled(next);
            uiAudio.playCue('uiToggle');
          }}
          detail={muted ? 'Master mute silences effects' : 'Hits, UI taps, stingers'}
          testID="settings-effects"
        />
      </View>

      <Text style={styles.section} allowFontScaling>
        Motion
      </Text>
      <View style={styles.stack}>
        <SettingsToggleRow
          label="Reduced motion"
          value={forceReducedMotion}
          onValueChange={(next) => {
            setForceReducedMotion(next);
            uiAudio.playCue('uiToggle');
          }}
          detail={
            osReducedMotion
              ? 'Your device setting is on'
              : 'Override only; OS preference is always respected'
          }
          testID="settings-reduced-motion"
        />
      </View>
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  section: {
    fontWeight: '800',
    fontSize: 12,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  stack: {
    gap: 10,
  },
});
