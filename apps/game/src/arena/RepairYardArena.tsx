/**
 * Layered Repair Yard arena — wall / floor / markings / contact shadows kept separate.
 * Robots and FX are children slotted by the canonical replay player.
 */
import React from 'react';
import { Image, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { ENVIRONMENT_BACKGROUND_SOURCES } from './environmentMetroAssets';
import { ENVIRONMENT_LAYER_Z, ENVIRONMENT_SCENE_CANVAS } from './environmentPin';
import type { PlacedActor } from './scenePlacement';

export interface RepairYardArenaProps {
  readonly near: PlacedActor;
  readonly far: PlacedActor;
  readonly sceneScale?: number;
  readonly showMarkings?: boolean;
  readonly style?: StyleProp<ViewStyle>;
  readonly children?: React.ReactNode;
  readonly testID?: string;
}

function ContactShadow({ actor }: { actor: PlacedActor }): React.ReactElement {
  const { contactShadow: s } = actor;
  const width = 256 * s.scaleX;
  const height = 96 * s.scaleY;
  return (
    <Image
      source={ENVIRONMENT_BACKGROUND_SOURCES.contactShadow}
      testID={`contact-shadow-${actor.slot}`}
      style={{
        position: 'absolute',
        left: s.x - s.pivotX * s.scaleX,
        top: s.y - s.pivotY * s.scaleY,
        width,
        height,
        zIndex: ENVIRONMENT_LAYER_Z.contactShadows,
      }}
    />
  );
}

export const RepairYardArena: React.FC<RepairYardArenaProps> = ({
  near,
  far,
  sceneScale = 1,
  showMarkings = true,
  style,
  children,
  testID = 'repair-yard-arena',
}) => {
  const w = ENVIRONMENT_SCENE_CANVAS.width;
  const h = ENVIRONMENT_SCENE_CANVAS.height;

  const displayW = w * sceneScale;
  const displayH = h * sceneScale;

  return (
    <View
      testID={testID}
      style={[
        styles.root,
        {
          width: displayW,
          height: displayH,
        },
        style,
      ]}
    >
      <View
        style={{
          position: 'absolute',
          width: w,
          height: h,
          // Scale from centre then offset so the visual top-left lands at (0,0).
          left: (displayW - w) / 2,
          top: (displayH - h) / 2,
          transform: [{ scale: sceneScale }],
        }}
      >
        <Image
          source={ENVIRONMENT_BACKGROUND_SOURCES.wall}
          style={[styles.fullLayer, { zIndex: ENVIRONMENT_LAYER_Z.wall }]}
          testID="arena-layer-wall"
        />
        <Image
          source={ENVIRONMENT_BACKGROUND_SOURCES.floor}
          style={[styles.fullLayer, { zIndex: ENVIRONMENT_LAYER_Z.floor }]}
          testID="arena-layer-floor"
        />
        {showMarkings ? (
          <Image
            source={ENVIRONMENT_BACKGROUND_SOURCES.markings}
            style={[styles.fullLayer, { zIndex: ENVIRONMENT_LAYER_Z.markings }]}
            testID="arena-layer-markings"
          />
        ) : null}
        <ContactShadow actor={far} />
        <ContactShadow actor={near} />
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    overflow: 'hidden',
    backgroundColor: '#2A2E32',
  },
  fullLayer: {
    position: 'absolute',
    left: 0,
    top: 0,
    width: ENVIRONMENT_SCENE_CANVAS.width,
    height: ENVIRONMENT_SCENE_CANVAS.height,
  },
});
