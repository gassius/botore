/**
 * Ranking row portrait — kit head part in the bot's real paint (Oxide / Petrol).
 * A5 live BotAssembler crop lands later; until then the workshop head PNG matches paint.
 */
import React from 'react';
import { Image, StyleSheet, View } from 'react-native';
import { resolvePaintVisual } from '../assembler/paints';
import { WORKSHOP_FRAME_PART_SOURCES } from '../assembler/workshopFrameAssets';
import { garageTag } from '../garage-tag';

export type RankingPortraitProps = {
  readonly paintId?: string | null;
  /** Display edge length in pt (mockup ~46). */
  readonly size?: number;
  readonly testID?: string;
};

function headSourceForPaint(paintId: string | null | undefined) {
  const visual = resolvePaintVisual(paintId ?? 'paint-crimson').visual;
  const key = visual === 'petrol' ? 'parts/head-petrol.png' : 'parts/head-oxide.png';
  return WORKSHOP_FRAME_PART_SOURCES[key] ?? WORKSHOP_FRAME_PART_SOURCES['parts/head-oxide.png'];
}

export function RankingPortrait({
  paintId,
  size = 46,
  testID = 'ranking-portrait',
}: RankingPortraitProps): React.ReactElement {
  const paint = resolvePaintVisual(paintId ?? 'paint-crimson');
  return (
    <View
      style={[
        styles.frame,
        {
          width: size,
          height: size,
          backgroundColor: paint.armourColor,
        },
      ]}
      accessibilityLabel={`Bot portrait, ${paint.label}`}
      testID={testID}
    >
      <Image
        source={headSourceForPaint(paintId)}
        style={{ width: size - 2, height: size - 2, marginTop: 2 }}
        resizeMode="contain"
        accessibilityIgnoresInvertColors
        accessible={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    borderWidth: 2.5,
    borderColor: garageTag.graphite,
    borderRadius: 7,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
});
