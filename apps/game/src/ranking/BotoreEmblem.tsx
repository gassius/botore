/**
 * Botore ranking emblem — shield with initials + colour until A5 emblems land.
 */
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { playerFacingDisplayName } from '../identity/platformPlayerId';
import { garageTag } from '../garage-tag';

export type BotoreEmblemProps = {
  readonly name: string;
  readonly emblemId?: string | null;
  readonly size?: number;
  readonly testID?: string;
};

/** Deterministic palette (mockup-adjacent) keyed by emblem/name — not account UUIDs. */
const EMBLEM_COLORS = [
  '#27877B',
  '#B23A2E',
  '#56687A',
  '#D9A21B',
  '#E8771C',
  '#6F7D3A',
  '#74506F',
  '#2F5FA8',
  '#5FA98A',
  '#938A7C',
] as const;

function hashKey(input: string): number {
  let h = 0;
  for (let i = 0; i < input.length; i += 1) {
    h = (h * 31 + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

function initialsFromName(name: string): string {
  const safe = playerFacingDisplayName(name).trim();
  const parts = safe.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '??';
  if (parts.length === 1) {
    return parts[0]!.slice(0, 2).toUpperCase();
  }
  return `${parts[0]![0] ?? ''}${parts[parts.length - 1]![0] ?? ''}`.toUpperCase();
}

export function BotoreEmblem({
  name,
  emblemId,
  size = 46,
  testID = 'ranking-emblem',
}: BotoreEmblemProps): React.ReactElement {
  const fill = useMemo(() => {
    const key = (emblemId && emblemId.trim()) || name;
    return EMBLEM_COLORS[hashKey(key) % EMBLEM_COLORS.length]!;
  }, [emblemId, name]);
  const initials = initialsFromName(name);
  const tip = Math.round(size * 0.28);

  return (
    <View style={{ width: size, height: size + tip - 4 }} testID={testID}>
      <View
        style={[
          styles.body,
          {
            width: size,
            height: size - tip + 8,
            backgroundColor: fill,
          },
        ]}
        accessibilityLabel={`Emblem ${initials}`}
      >
        <Text style={styles.initials} allowFontScaling>
          {initials}
        </Text>
      </View>
      <View
        style={[
          styles.tip,
          {
            borderLeftWidth: size / 2,
            borderRightWidth: size / 2,
            borderTopWidth: tip,
            borderTopColor: fill,
          },
        ]}
        accessible={false}
      />
      {/* Outline tip stroke approximation */}
      <View
        pointerEvents="none"
        style={[styles.outline, { width: size, height: size + tip - 4 }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  body: {
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderBottomWidth: 0,
    borderTopLeftRadius: 4,
    borderTopRightRadius: 4,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 9,
  },
  tip: {
    width: 0,
    height: 0,
    backgroundColor: 'transparent',
    borderStyle: 'solid',
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginTop: -1,
  },
  initials: {
    color: garageTag.white,
    fontWeight: '900',
    fontSize: 15,
    letterSpacing: 0.4,
    textShadowColor: garageTag.graphite,
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 0,
  },
  outline: {
    position: 'absolute',
    left: 0,
    top: 0,
    borderWidth: 0,
  },
});
