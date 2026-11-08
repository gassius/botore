import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { garageTag } from './tokens';

export type TabItem = {
  id: string;
  label: string;
};

export type TabBarProps = {
  tabs: TabItem[];
  selectedId: string;
  onSelect: (id: string) => void;
  testID?: string;
};

/** Tab selection uses mustard fill + selected a11y state — not colour alone. */
export function TabBar({ tabs, selectedId, onSelect, testID }: TabBarProps): React.ReactElement {
  return (
    <View style={styles.row} accessibilityRole="tablist" testID={testID}>
      {tabs.map((tab) => {
        const selected = tab.id === selectedId;
        return (
          <Pressable
            key={tab.id}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            accessibilityLabel={`${tab.label}${selected ? ', selected' : ''}`}
            onPress={() => onSelect(tab.id)}
            style={[styles.tab, selected ? styles.tabSelected : styles.tabIdle]}
            testID={testID ? `${testID}-${tab.id}` : undefined}
          >
            <Text style={[styles.label, selected ? styles.labelSelected : null]} allowFontScaling>
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
    gap: 8,
  },
  tab: {
    flex: 1,
    minHeight: garageTag.touchMin,
    borderWidth: garageTag.outline,
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  tabSelected: {
    backgroundColor: garageTag.mustard,
  },
  tabIdle: {
    backgroundColor: garageTag.cream,
  },
  label: {
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: garageTag.steel,
  },
  labelSelected: {
    color: garageTag.graphite,
  },
});
