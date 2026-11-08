import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import {
  PrimaryButton,
  ScreenChrome,
  ScreenHeader,
  garageTag,
} from '../../garage-tag';
import { useFirstRun } from '../FirstRunContext';
import { DomainNote } from './DomainNote';

/**
 * Route slot: Ranking — ticket 1amjtrey0ex owns RankingReadPort + fixture UI.
 * Shell only provides the named route mount point.
 */
export function RankingSlot(): React.ReactElement {
  const { goTo } = useFirstRun();

  return (
    <ScreenChrome
      testID="slot-ranking"
      footer={<PrimaryButton label="Back to stable" onPress={() => goTo('Stable')} testID="ranking-back" />}
    >
      <ScreenHeader title="Ranking" />
      <View style={styles.mount}>
        <Text style={styles.title} allowFontScaling>
          Ranking slot
        </Text>
        <Text style={styles.body} allowFontScaling>
          PLACEHOLDER mount for Ranking scaffold (1amjtrey0ex). No client reordering or invented
          algorithm in the shell.
        </Text>
      </View>
      <DomainNote text="Domain: RankingReadPort.list() + DEV fixtures. Shell route only." />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  mount: {
    minHeight: 220,
    borderWidth: garageTag.outline,
    borderStyle: 'dashed',
    borderColor: garageTag.graphite,
    borderRadius: garageTag.cutCorner,
    backgroundColor: garageTag.paper,
    padding: 16,
    gap: 10,
    justifyContent: 'center',
  },
  title: {
    fontWeight: '900',
    fontSize: 18,
    textTransform: 'uppercase',
    color: garageTag.graphite,
    textAlign: 'center',
  },
  body: {
    fontSize: 13,
    fontWeight: '600',
    color: garageTag.steel,
    textAlign: 'center',
  },
});
