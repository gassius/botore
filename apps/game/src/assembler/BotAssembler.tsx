/**
 * Shared BotAssembler — one module for stable / preview / fight.
 *
 * RN Animated first (no Skia). Workshop Frame kit-v001 PNGs when
 * `placeholder={false}` (default); geometric PLACEHOLDER when true.
 * Shell and F8 import this component; do not fork a second renderer.
 *
 * Local validation only — not approved final likeness or native perf/replay.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, Image, StyleSheet, Text, View } from 'react-native';
import { assembleBot, provisionalMotionOffset } from './assemble';
import { kitLayerAnchorLeft } from './kitMath';
import type { AssembledLayer, BotAssemblerProps } from './types';
import { workshopFramePartSource } from './workshopFrameAssets';

const DEFAULT_SIZE = 280; // PROVISIONAL display width — not an export budget.

function PlaceholderLayer({
  layer,
  scale,
}: {
  layer: AssembledLayer;
  scale: number;
}): React.ReactElement {
  if (layer.role === 'label') {
    return (
      <Text
        style={[
          styles.kitLabel,
          {
            left: layer.x * scale,
            top: layer.y * scale,
            width: layer.width * scale,
            fontSize: Math.max(7, 8 * scale),
          },
        ]}
        numberOfLines={1}
      >
        {layer.label}
      </Text>
    );
  }

  return (
    <View
      testID={`assembler-layer-${layer.id}`}
      accessibilityLabel={layer.label}
      style={{
        position: 'absolute',
        left: layer.x * scale,
        top: layer.y * scale,
        width: layer.width * scale,
        height: layer.height * scale,
        backgroundColor: layer.color,
        borderWidth:
          layer.kind === 'metal' || layer.kind === 'weapon' ? StyleSheet.hairlineWidth * 2 : 0,
        borderColor: '#1A1E22',
        borderRadius: layer.role === 'shadow' ? 999 : layer.role === 'head' ? 4 : 2,
        opacity: layer.role === 'shadow' ? 1 : layer.isPaintMask ? 0.92 : 1,
        zIndex: layer.zIndex,
      }}
    />
  );
}

function KitLayer({
  layer,
  scale,
  mirrored,
  canvasSize,
}: {
  layer: AssembledLayer;
  scale: number;
  mirrored: boolean;
  canvasSize: number;
}): React.ReactElement | null {
  const source = layer.imagePath ? workshopFramePartSource(layer.imagePath) : undefined;
  if (!source || layer.worldPivotX === undefined || layer.worldPivotY === undefined) {
    return null;
  }
  const pivotX = (layer.pivotX ?? 0) * scale;
  const pivotY = (layer.pivotY ?? 0) * scale;
  // RN rotate is counter-clockwise positive; kit angles are clockwise.
  const rotateCcw = -((layer.rotateCwDeg ?? 0) % 360);
  // Per-layer mirror (not parent canvas scaleX:-1) so Expo web keeps Images
  // inside overflow clips — same fix as F9 Confirm tip 1f25ea0.
  const left = kitLayerAnchorLeft(layer.worldPivotX, scale, canvasSize, mirrored);

  return (
    <View
      testID={`assembler-layer-${layer.id}`}
      accessibilityLabel={layer.label}
      pointerEvents="none"
      style={{
        position: 'absolute',
        left,
        top: layer.worldPivotY * scale,
        width: 0,
        height: 0,
        zIndex: layer.zIndex,
      }}
    >
      <View
        style={{
          transform: [
            ...(mirrored ? ([{ scaleX: -1 }] as const) : []),
            { rotate: `${rotateCcw}deg` },
          ],
        }}
      >
        <Image
          source={source}
          style={{
            position: 'absolute',
            left: -pivotX,
            top: -pivotY,
            width: layer.width * scale,
            height: layer.height * scale,
          }}
        />
      </View>
    </View>
  );
}

/**
 * Renders an assembled bot from loadout props. Same component for Stable,
 * Customise preview, ConfirmFight, and fight replay fighters.
 */
export const BotAssembler: React.FC<BotAssemblerProps> = ({
  loadout,
  facing,
  paintId,
  weaponId,
  motionPose = 'idle',
  reducedMotion = false,
  placeholder = false,
  size = DEFAULT_SIZE,
  testID = 'bot-assembler',
}) => {
  const assembled = useMemo(
    () =>
      assembleBot({
        loadout,
        facing,
        motionPose,
        placeholder,
        ...(paintId !== undefined ? { paintId } : {}),
        ...(weaponId !== undefined ? { weaponId } : {}),
      }),
    [loadout, facing, paintId, weaponId, motionPose, placeholder],
  );

  const scale = size / assembled.canvas.width;
  const height = assembled.canvas.height * scale;

  const anim = useRef(new Animated.Value(0)).current;
  const placeholderMotion = provisionalMotionOffset(assembled.motionPose, reducedMotion);

  useEffect(() => {
    anim.setValue(0);
    if (!assembled.placeholder || reducedMotion || motionPose === 'idle') {
      return;
    }
    const loop = Animated.sequence([
      Animated.timing(anim, {
        toValue: 1,
        duration: 280, // PROVISIONAL
        useNativeDriver: true,
      }),
      Animated.timing(anim, {
        toValue: 0,
        duration: 320, // PROVISIONAL
        useNativeDriver: true,
      }),
    ]);
    loop.start();
    return () => {
      loop.stop();
    };
  }, [anim, assembled.placeholder, motionPose, reducedMotion]);

  const translateX = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, placeholderMotion.translateX * scale * (assembled.mirrored ? -1 : 1)],
  });
  const translateY = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, placeholderMotion.translateY * scale],
  });
  const rotate = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [
      '0deg',
      `${assembled.mirrored ? -placeholderMotion.rotateDeg : placeholderMotion.rotateDeg}deg`,
    ],
  });

  // Expo web: parent canvas scaleX(-1) + absolute Image layers paints a blank cream
  // box. Mirror per-layer in KitLayer instead (kit README facing still honored).
  return (
    <View
      testID={testID}
      accessibilityLabel={`bot ${assembled.paintVisual} ${assembled.weaponKind} facing ${facing}${
        assembled.placeholder ? ' PLACEHOLDER' : ` ${assembled.kitId ?? 'kit'}`
      }`}
      style={[styles.root, { width: size, minHeight: height }]}
    >
      <Animated.View
        style={[
          styles.canvas,
          {
            width: size,
            height,
            overflow: 'visible',
            transform: assembled.placeholder ? [{ translateX }, { translateY }, { rotate }] : [],
          },
        ]}
      >
        {assembled.layers.map((layer) =>
          assembled.placeholder ? (
            <PlaceholderLayer key={layer.id} layer={layer} scale={scale} />
          ) : (
            <KitLayer
              key={layer.id}
              layer={layer}
              scale={scale}
              mirrored={assembled.mirrored}
              canvasSize={size}
            />
          ),
        )}
      </Animated.View>
      <Text style={styles.badge} testID={`${testID}-badge`}>
        {assembled.placeholder
          ? `PLACEHOLDER · ${assembled.paintVisual.toUpperCase()} · ${assembled.weaponKind.toUpperCase()}`
          : `kit-v002 local · ${assembled.paintVisual.toUpperCase()} · ${assembled.weaponKind.toUpperCase()} · NOT FINAL`}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'flex-start',
  },
  canvas: {
    position: 'relative',
    overflow: 'visible',
  },
  kitLabel: {
    position: 'absolute',
    color: '#1A1E22',
    fontWeight: '700',
    zIndex: 20,
  },
  badge: {
    marginTop: 6,
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.4,
    color: '#4A5158',
    textAlign: 'center',
  },
});
