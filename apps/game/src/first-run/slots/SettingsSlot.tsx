import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
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

  return (
    <ScreenChrome testID="slot-settings">
      <BrandWordmark width={160} />
      <ScreenHeader title="Settings" onBack={goBack} testID="settings-header" />

      <Text style={styles.section} allowFontScaling>
        Audio
      </Text>
      <View style={styles.stack}>
        <SettingsToggleRow
          label="Master mute"
          value={muted}
          onValueChange={setMuted}
          detail="Persists across launches"
          testID="settings-master-mute"
        />
        <SettingsToggleRow
          label="Music"
          value={musicEnabled}
          onValueChange={setMusicEnabled}
          detail={muted ? 'Master mute silences music' : 'Fight music loop'}
          testID="settings-music"
        />
        <SettingsToggleRow
          label="Effects"
          value={effectsEnabled}
          onValueChange={setEffectsEnabled}
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
          onValueChange={setForceReducedMotion}
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
