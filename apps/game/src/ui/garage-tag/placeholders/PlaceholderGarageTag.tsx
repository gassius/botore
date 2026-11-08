import React from 'react';
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  type StyleProp,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import glyphBack from '../../../../assets/ui-kit-v0.1/glyph-back.png';
import robotHeadSmall from '../../../../assets/ui-kit-v0.1/robot-head-small.png';
import { PLACEHOLDER_GARAGE_TAG_TOKENS as T } from './tokens';

/**
 * PLACEHOLDER Garage Tag primitives for Ranking until shell ticket
 * 1amjtrey0ew exports the real components. Marked PLACEHOLDER — swap import
 * path when the shell package is available; do not fork a second design system.
 *
 * Chrome art: ui-kit-v0.1 (panel / name-tag / buttons / selection-frame /
 * status-error / robot-head-small / glyph-back) — ranking chrome only, not
 * live ranking data.
 */

export type PlaceholderPanelProps = {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  highlighted?: boolean;
  accessibilityLabel?: string;
};

export function PlaceholderGarageTagPanel({
  children,
  style,
  highlighted = false,
  accessibilityLabel,
}: PlaceholderPanelProps): React.ReactElement {
  return (
    <View
      accessibilityLabel={accessibilityLabel}
      style={[
        styles.panel,
        highlighted ? styles.panelHighlighted : null,
        style,
      ]}
    >
      {children}
    </View>
  );
}

export type PlaceholderButtonProps = {
  label: string;
  onPress?: (() => void) | undefined;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
  accessibilityHint?: string;
};

export function PlaceholderGarageTagButton({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  accessibilityHint,
}: PlaceholderButtonProps): React.ReactElement {
  const isPrimary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        isPrimary ? styles.buttonPrimary : styles.buttonSecondary,
        disabled ? styles.buttonDisabled : null,
        pressed && !disabled ? styles.buttonPressed : null,
      ]}
    >
      <Text
        style={[
          styles.buttonLabel,
          isPrimary ? styles.buttonLabelPrimary : styles.buttonLabelSecondary,
          disabled ? styles.buttonLabelDisabled : null,
        ]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

export type PlaceholderNameplateProps = {
  name: string;
  style?: StyleProp<TextStyle>;
};

export function PlaceholderGarageTagNameplate({
  name,
  style,
}: PlaceholderNameplateProps): React.ReactElement {
  return (
    <Text style={[styles.nameplate, style]} numberOfLines={3}>
      {name}
    </Text>
  );
}

export type PlaceholderOwnershipBadgeProps = {
  label?: string;
};

/** Explicit ownership cue — label/shape, not paint alone. */
export function PlaceholderGarageTagOwnershipBadge({
  label = 'YOU',
}: PlaceholderOwnershipBadgeProps): React.ReactElement {
  return (
    <View
      accessibilityLabel={label}
      style={styles.ownershipBadge}
      importantForAccessibility="yes"
    >
      <Text style={styles.ownershipBadgeText}>{label}</Text>
    </View>
  );
}

export function PlaceholderGarageTagRobotHead(): React.ReactElement {
  return (
    <Image
      source={robotHeadSmall}
      style={styles.robotHead}
      accessibilityIgnoresInvertColors
      accessible={false}
    />
  );
}

export type PlaceholderBackControlProps = {
  onPress?: (() => void) | undefined;
  label?: string;
};

export function PlaceholderGarageTagBackControl({
  onPress,
  label = 'BACK',
}: PlaceholderBackControlProps): React.ReactElement {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [
        styles.backControl,
        pressed ? styles.buttonPressed : null,
      ]}
    >
      <Image source={glyphBack} style={styles.backGlyph} accessible={false} />
      <Text style={styles.backLabel}>{label}</Text>
    </Pressable>
  );
}

export function PlaceholderDevBanner(): React.ReactElement {
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel="Development ranking fixtures, not live players"
      style={styles.devBanner}
    >
      <Text style={styles.devBannerText}>DEV FIXTURES — NOT LIVE PLAYERS</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: T.creamPanel,
    borderColor: T.stroke,
    borderWidth: T.strokeWidth,
    borderRadius: T.cornerRadius,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  panelHighlighted: {
    borderColor: T.mustard,
    borderWidth: 4,
  },
  button: {
    minHeight: T.minTouch,
    borderRadius: T.cornerRadius,
    borderWidth: T.strokeWidth,
    borderColor: T.stroke,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonPrimary: {
    backgroundColor: T.mustard,
  },
  buttonSecondary: {
    backgroundColor: T.creamPanel,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
  buttonPressed: {
    transform: [{ translateY: 1 }],
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  buttonLabelPrimary: {
    color: T.graphite,
  },
  buttonLabelSecondary: {
    color: T.graphite,
  },
  buttonLabelDisabled: {
    color: T.mutedText,
  },
  nameplate: {
    color: T.graphite,
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 0.4,
    flexShrink: 1,
  },
  ownershipBadge: {
    backgroundColor: T.mustard,
    borderColor: T.stroke,
    borderWidth: 2,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 4,
    marginLeft: 8,
  },
  ownershipBadgeText: {
    color: T.graphite,
    fontSize: 12,
    fontWeight: '900',
    letterSpacing: 0.8,
  },
  robotHead: {
    width: 44,
    height: 44,
    marginRight: 10,
  },
  backControl: {
    minHeight: T.minTouch,
    minWidth: T.minTouch,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    borderRadius: T.cornerRadius,
    borderWidth: T.strokeWidth,
    borderColor: T.stroke,
    backgroundColor: T.creamPanel,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  backGlyph: {
    width: 24,
    height: 24,
  },
  backLabel: {
    color: T.graphite,
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.6,
  },
  devBanner: {
    backgroundColor: T.graphite,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'stretch',
  },
  devBannerText: {
    color: T.mustard,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
