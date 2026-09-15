import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Button, Alert } from 'react-native';
import { BattleStage } from '../components/BattleStage';
import { BattleReplayController } from '../BattleReplayController';
import type { ReplayStage } from '../BattleReplayController';
import { runGoldenBattle, goldenBattle } from '@botore/test-fixtures';

export const BattleReplayScreen: React.FC = () => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [commandCount, setCommandCount] = useState(0);
  const stageRef = useRef<ReplayStage | null>(null);
  const controllerRef = useRef<BattleReplayController | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const handleLoadReplay = () => {
    try {
      const replay = runGoldenBattle(goldenBattle(0));
      if (!stageRef.current) {
        Alert.alert('Error', 'Stage not initialized');
        return;
      }

      controllerRef.current = new BattleReplayController(stageRef.current);
      const total = controllerRef.current.load(replay);
      setCommandCount(total);
      setIsPlaying(false);
      Alert.alert('Replay Loaded', `${total} commands ready`);
    } catch (err) {
      Alert.alert('Load Error', err instanceof Error ? err.message : String(err));
    }
  };

  const handlePlayReplay = () => {
    if (!controllerRef.current) {
      Alert.alert('Error', 'Load a replay first');
      return;
    }
    setIsPlaying(true);
  };

  useEffect(() => {
    if (!isPlaying || !controllerRef.current) {
      return;
    }

    let lastTime = Date.now();

    const animate = () => {
      const now = Date.now();
      const deltaMs = now - lastTime;
      lastTime = now;

      const stillPlaying = controllerRef.current!.update(deltaMs, now);

      if (stillPlaying) {
        animationFrameRef.current = requestAnimationFrame(animate);
      } else {
        setIsPlaying(false);
        Alert.alert('Replay Complete', 'Battle finished');
      }
    };

    animationFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationFrameRef.current !== null) {
        cancelAnimationFrame(animationFrameRef.current);
      }
    };
  }, [isPlaying]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Botore Battle Replay</Text>

      <BattleStage
        onStageReady={(stage) => {
          stageRef.current = stage;
        }}
      />

      <View style={styles.controls}>
        <Button title="Load Golden Fixture 0" onPress={handleLoadReplay} />
        <Button
          title={isPlaying ? 'Playing...' : 'Play Replay'}
          onPress={handlePlayReplay}
          disabled={!controllerRef.current || isPlaying}
        />
        {commandCount > 0 && <Text style={styles.info}>Commands: {commandCount}</Text>}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f0f0',
    padding: 20,
    justifyContent: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 20,
  },
  controls: {
    gap: 10,
    marginTop: 20,
  },
  info: {
    textAlign: 'center',
    fontSize: 14,
    color: '#666',
  },
});
