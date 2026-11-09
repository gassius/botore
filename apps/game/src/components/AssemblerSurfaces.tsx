/**
 * Proof surfaces that mount the SAME `BotAssembler` for stable / preview / fight.
 *
 * Not the Garage Tag shell (shell ticket) and not F8 auth/save — only the
 * shared visual assembly contract for F7 review.
 */

import React, { useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BotAssembler } from '../assembler';
import type { AssemblerLoadoutInput, MotionPose } from '../assembler';
import { OXIDE_PAINT, PETROL_PAINT, PLACEHOLDER_WEAPONS } from '../assembler';

const BASE_LOADOUT: AssemblerLoadoutInput = {
  chassis: 'chassis-basic',
  paint: OXIDE_PAINT.cataloguePaintId,
  weapon: PLACEHOLDER_WEAPONS.sword.catalogueId,
};

type SurfaceKind = 'stable' | 'preview' | 'fight';

export const AssemblerSurfaces: React.FC = () => {
  const [paintId, setPaintId] = useState(OXIDE_PAINT.cataloguePaintId);
  const [weaponId, setWeaponId] = useState(PLACEHOLDER_WEAPONS.sword.catalogueId);
  const [pose, setPose] = useState<MotionPose>('idle');
  const [surface, setSurface] = useState<SurfaceKind>('stable');

  const playerLoadout = useMemo(
    () => ({ ...BASE_LOADOUT, paint: paintId, weapon: weaponId }),
    [paintId, weaponId],
  );

  const opponentLoadout = useMemo(
    (): AssemblerLoadoutInput => ({
      chassis: 'chassis-basic',
      paint: PETROL_PAINT.cataloguePaintId,
      weapon: PLACEHOLDER_WEAPONS.axe.catalogueId,
    }),
    [],
  );

  return (
    <View style={styles.root} testID="assembler-surfaces">
      <Text style={styles.title}>F7 BotAssembler proof</Text>
      <Text style={styles.sub}>
        Same module · Workshop Frame PLACEHOLDER · Oxide/Petrol masks · shared grip
      </Text>

      <View style={styles.tabs}>
        {(['stable', 'preview', 'fight'] as const).map((kind) => (
          <Pressable
            key={kind}
            testID={`surface-tab-${kind}`}
            onPress={() => setSurface(kind)}
            style={[styles.tab, surface === kind && styles.tabActive]}
          >
            <Text style={[styles.tabText, surface === kind && styles.tabTextActive]}>
              {kind.toUpperCase()}
            </Text>
          </Pressable>
        ))}
      </View>

      {surface === 'stable' ? (
        <View style={styles.panel} testID="surface-stable">
          <Text style={styles.panelLabel}>STABLE</Text>
          <BotAssembler
            loadout={playerLoadout}
            facing="right"
            placeholder={false}
            testID="assembler-stable"
          />
        </View>
      ) : null}

      {surface === 'preview' ? (
        <View style={styles.panel} testID="surface-preview">
          <Text style={styles.panelLabel}>CUSTOMISE PREVIEW</Text>
          <BotAssembler
            loadout={BASE_LOADOUT}
            facing="right"
            paintId={paintId}
            weaponId={weaponId}
            placeholder={false}
            testID="assembler-preview"
          />
          <View style={styles.row}>
            <Pressable
              testID="paint-oxide"
              style={[styles.swatch, { backgroundColor: OXIDE_PAINT.armourColor }]}
              onPress={() => setPaintId(OXIDE_PAINT.cataloguePaintId)}
            >
              <Text style={styles.swatchText}>OXIDE</Text>
            </Pressable>
            <Pressable
              testID="paint-petrol"
              style={[styles.swatch, { backgroundColor: PETROL_PAINT.armourColor }]}
              onPress={() => setPaintId(PETROL_PAINT.cataloguePaintId)}
            >
              <Text style={styles.swatchText}>PETROL</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            {Object.values(PLACEHOLDER_WEAPONS).map((w) => (
              <Pressable
                key={w.kind}
                testID={`weapon-${w.kind}`}
                style={[styles.chip, weaponId === w.catalogueId && styles.chipActive]}
                onPress={() => setWeaponId(w.catalogueId)}
              >
                <Text style={styles.chipText}>{w.label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {surface === 'fight' ? (
        <View style={styles.panel} testID="surface-fight">
          <Text style={styles.panelLabel}>FIGHT · raised staggered (PROVISIONAL)</Text>
          <View style={styles.arena}>
            <View style={styles.near}>
              <Text style={styles.nameplate}>YOU</Text>
              <BotAssembler
                loadout={playerLoadout}
                facing="right"
                motionPose={pose}
                size={200}
                placeholder={false}
                testID="assembler-fight-player"
              />
            </View>
            <View style={styles.far}>
              <Text style={styles.nameplate}>OPP</Text>
              <BotAssembler
                loadout={opponentLoadout}
                facing="left"
                motionPose={pose === 'attack' ? 'hit' : pose}
                size={170}
                placeholder={false}
                testID="assembler-fight-opponent"
              />
            </View>
          </View>
          <View style={styles.row}>
            {(['idle', 'attack', 'dodge', 'hit', 'defeat'] as const).map((p) => (
              <Pressable
                key={p}
                testID={`pose-${p}`}
                style={[styles.chip, pose === p && styles.chipActive]}
                onPress={() => setPose(p)}
              >
                <Text style={styles.chipText}>{p}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    padding: 12,
    backgroundColor: '#E8DFD0',
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
    color: '#2A2E32',
    textAlign: 'center',
  },
  sub: {
    marginTop: 4,
    marginBottom: 10,
    fontSize: 11,
    color: '#5A6066',
    textAlign: 'center',
  },
  tabs: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    borderWidth: 2,
    borderColor: '#2A2E32',
    backgroundColor: '#F3EADF',
    alignItems: 'center',
  },
  tabActive: {
    backgroundColor: '#E3B23C',
  },
  tabText: {
    fontWeight: '800',
    fontSize: 11,
    color: '#2A2E32',
  },
  tabTextActive: {
    color: '#1A1E22',
  },
  panel: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#2A2E32',
    backgroundColor: '#F7F0E6',
    padding: 12,
    alignItems: 'center',
  },
  panelLabel: {
    alignSelf: 'stretch',
    fontWeight: '800',
    fontSize: 12,
    marginBottom: 8,
    color: '#2A2E32',
  },
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
    justifyContent: 'center',
  },
  swatch: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 2,
    borderColor: '#1A1E22',
    minWidth: 88,
    alignItems: 'center',
  },
  swatchText: {
    fontWeight: '800',
    color: '#fff',
  },
  chip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 2,
    borderColor: '#2A2E32',
    backgroundColor: '#E8DFD0',
  },
  chipActive: {
    backgroundColor: '#E3B23C',
  },
  chipText: {
    fontWeight: '700',
    fontSize: 11,
    color: '#2A2E32',
    textTransform: 'uppercase',
  },
  arena: {
    width: '100%',
    minHeight: 220,
    backgroundColor: '#D9D2C4',
    borderWidth: 1,
    borderColor: '#9A9284',
    position: 'relative',
  },
  near: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    alignItems: 'center',
  },
  far: {
    position: 'absolute',
    right: 12,
    top: 16,
    alignItems: 'center',
  },
  nameplate: {
    fontSize: 10,
    fontWeight: '800',
    marginBottom: 4,
    color: '#2A2E32',
  },
});
