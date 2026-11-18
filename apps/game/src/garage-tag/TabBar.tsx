import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';

export type TabItem = {
  id: string;
  label: string;
  /** Dashed / non-interactive — empty catalogue slot until parts arrive. */
  disabled?: boolean;
};

export type TabBarProps = {
  tabs: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  /**
   * D3 Customise: 38pt visual tabs with hitSlop so the press target stays ≥48pt.
   * Default keeps full touchMin height for other screens.
   */
  compact?: boolean;
  testID?: string;
};

/** Tab selection uses mustard fill + selected a11y state — not colour alone. */
export function TabBar({
  tabs,
  selectedId,
  onSelect,
  compact = false,
  testID,
}: TabBarProps): React.ReactElement {
  const hitSlop = compact ? { top: 5, bottom: 5, left: 0, right: 0 } : undefined;
  return (
    <View style={styles.row} accessibilityRole="tablist" testID={testID}>
      {tabs.map((tab) => {
        const disabled = tab.disabled === true;
        const selected = !disabled && tab.id === selectedId;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected, disabled }}
            accessibilityLabel={`${tab.label}${selected ? ', selected' : ''}${
              disabled ? ', unavailable' : ''
            }`}
            disabled={disabled}
            hitSlop={hitSlop}
            onPress={() => {
              if (!disabled) onSelect(tab.id);
            }}
            style={[
              styles.tab,
              compact ? styles.tabCompact : styles.tabDefault,
              selected ? styles.tabSelected : styles.tabIdle,
              disabled ? styles.tabDisabled : null,
            ]}
            testID={testID ? `${testID}-${tab.id}` : undefined}
          >
            <Text
              style={[
                compact ? styles.labelCompact : styles.label,
                selected ? styles.labelSelected : null,
                disabled ? styles.labelDisabled : null,
              ]}
              numberOfLines={1}
              allowFontScaling
            >
              {tab.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: 5,
  },
  tab: {
    flex: 1,
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  tabDefault: {
    minHeight: garageTag.touchMin,
  },
  tabCompact: {
    height: 38,
    minHeight: 38,
  },
  tabSelected: {
    backgroundColor: garageTag.mustard,
  },
  tabIdle: {
    backgroundColor: garageTag.cream,
  },
  tabDisabled: {
    borderStyle: 'dashed',
    borderColor: garageTag.steel,
    backgroundColor: garageTag.cream,
  },
  label: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  labelCompact: {
    fontWeight: '800',
    fontSize: 10.5,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: garageTag.graphite,
  },
  labelSelected: {
    color: garageTag.graphite,
  },
  labelDisabled: {
    color: garageTag.steel,
  },
});
