import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ScreenChrome, ScreenHeader } from '../../garage-tag';
import { useFirstRun } from '../FirstRunContext';

/**
 * D5 route shell for Create Bot — D6 replaces body with name / paint / weapon.
 * Keeps Ludus → Create Bot navigation wired without player-facing stub copy.
 */
export function CreateBotSlot(): React.ReactElement {
  const { goTo } = useFirstRun();
  return (
    <ScreenChrome testID="slot-create-bot" scroll={false}>
      <ScreenHeader title="Create Bot" onBack={() => goTo('Stable')} testID="create-bot-header" />
      <View style={styles.body} testID="create-bot-placeholder" />
    </ScreenChrome>
  );
}

const styles = StyleSheet.create({
  body: {
    flex: 1,
  },
});
