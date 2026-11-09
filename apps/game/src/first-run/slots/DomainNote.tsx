import React from 'react';
import { Text, StyleSheet } from 'react-native';
import { garageTag } from '../../garage-tag';

export function DomainNote({ text }: { text: string }): React.ReactElement {
  return (
    <Text style={styles.note} allowFontScaling>
      {text}
    </Text>
  );
}

const styles = StyleSheet.create({
  note: {
    fontSize: 12,
    fontWeight: '600',
    color: garageTag.steel,
    textAlign: 'center',
  },
});
