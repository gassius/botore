import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated } from 'react-native';
import type { ReplayStage, StageNode } from '../BattleReplayController';

interface BattleStageProps {
  onStageReady: (stage: ReplayStage) => void;
}

class ReactNativeStageNode implements StageNode {
  name: string;
  active: boolean = true;
  private attributes = new Map<string, string | number>();
  private listeners = new Set<() => void>();

  constructor(name: string) {
    this.name = name;
  }

  getChildByName(_name: string): StageNode | null {
    return null;
  }

  setAttribute(key: string, value: string | number): void {
    this.attributes.set(key, value);
    this.notifyListeners();
  }

  getAttribute(key: string): string | number | undefined {
    return this.attributes.get(key);
  }

  addListener(listener: () => void): void {
    this.listeners.add(listener);
  }

  removeListener(listener: () => void): void {
    this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    this.listeners.forEach((listener) => listener());
  }
}

export const BattleStage: React.FC<BattleStageProps> = ({ onStageReady }) => {
  const [bannerText, setBannerText] = useState('');
  const [resultText, setResultText] = useState('');
  const [resultVisible, setResultVisible] = useState(false);

  const attackerHpAnim = useRef(new Animated.Value(1)).current;
  const defenderHpAnim = useRef(new Animated.Value(1)).current;

  const attackerNode = useRef<ReactNativeStageNode>(
    new ReactNativeStageNode('player-hero'),
  ).current;
  const defenderNode = useRef<ReactNativeStageNode>(
    new ReactNativeStageNode('opp-sir-bot'),
  ).current;
  const attackerHpBar = useRef<ReactNativeStageNode>(
    new ReactNativeStageNode('attacker-hp'),
  ).current;
  const defenderHpBar = useRef<ReactNativeStageNode>(
    new ReactNativeStageNode('defender-hp'),
  ).current;
  const banner = useRef<ReactNativeStageNode>(new ReactNativeStageNode('banner')).current;
  const resultPanel = useRef<ReactNativeStageNode>(new ReactNativeStageNode('result')).current;

  useEffect(() => {
    const stage: ReplayStage = {
      attacker: attackerNode,
      defender: defenderNode,
      attackerHpBar,
      defenderHpBar,
      banner,
      resultPanel,
    };

    const attackerHpListener = () => {
      const hpRatio = attackerHpBar.getAttribute('hpRatio');
      if (typeof hpRatio === 'number') {
        Animated.timing(attackerHpAnim, {
          toValue: hpRatio,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
    };

    const defenderHpListener = () => {
      const hpRatio = defenderHpBar.getAttribute('hpRatio');
      if (typeof hpRatio === 'number') {
        Animated.timing(defenderHpAnim, {
          toValue: hpRatio,
          duration: 300,
          useNativeDriver: false,
        }).start();
      }
    };

    const bannerListener = () => {
      const text = banner.getAttribute('text');
      if (typeof text === 'string') {
        setBannerText(text);
      }
    };

    const resultListener = () => {
      setResultVisible(resultPanel.active);
      const winner = resultPanel.getAttribute('winner');
      if (typeof winner === 'string') {
        setResultText(winner === 'draw' ? 'Draw!' : `Winner: ${winner}`);
      }
    };

    attackerHpBar.addListener(attackerHpListener);
    defenderHpBar.addListener(defenderHpListener);
    banner.addListener(bannerListener);
    resultPanel.addListener(resultListener);

    onStageReady(stage);

    return () => {
      attackerHpBar.removeListener(attackerHpListener);
      defenderHpBar.removeListener(defenderHpListener);
      banner.removeListener(bannerListener);
      resultPanel.removeListener(resultListener);
    };
  }, [
    onStageReady,
    attackerNode,
    defenderNode,
    attackerHpBar,
    defenderHpBar,
    banner,
    resultPanel,
    attackerHpAnim,
    defenderHpAnim,
  ]);

  const attackerWidth = attackerHpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const defenderWidth = defenderHpAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  return (
    <View style={styles.stage}>
      {bannerText ? <Text style={styles.banner}>{bannerText}</Text> : null}

      <View style={styles.fighters}>
        <View style={styles.fighter}>
          <View style={styles.characterBox}>
            <Text style={styles.characterName}>Attacker</Text>
            <Text style={styles.characterId}>{attackerNode.name}</Text>
          </View>
          <View style={styles.hpBarContainer}>
            <Animated.View style={[styles.hpBar, styles.hpBarAttacker, { width: attackerWidth }]} />
          </View>
        </View>

        <View style={styles.fighter}>
          <View style={styles.characterBox}>
            <Text style={styles.characterName}>Defender</Text>
            <Text style={styles.characterId}>{defenderNode.name}</Text>
          </View>
          <View style={styles.hpBarContainer}>
            <Animated.View style={[styles.hpBar, styles.hpBarDefender, { width: defenderWidth }]} />
          </View>
        </View>
      </View>

      {resultVisible && (
        <View style={styles.resultPanel}>
          <Text style={styles.resultText}>{resultText}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  stage: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  banner: {
    fontSize: 18,
    fontWeight: '600',
    textAlign: 'center',
    marginBottom: 20,
    color: '#333',
  },
  fighters: {
    flex: 1,
    justifyContent: 'space-around',
  },
  fighter: {
    marginVertical: 10,
  },
  characterBox: {
    backgroundColor: '#f5f5f5',
    padding: 15,
    borderRadius: 8,
    marginBottom: 10,
  },
  characterName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  characterId: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  hpBarContainer: {
    height: 20,
    backgroundColor: '#ddd',
    borderRadius: 10,
    overflow: 'hidden',
  },
  hpBar: {
    height: '100%',
    borderRadius: 10,
  },
  hpBarAttacker: {
    backgroundColor: '#4CAF50',
  },
  hpBarDefender: {
    backgroundColor: '#2196F3',
  },
  resultPanel: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 10,
  },
  resultText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
  },
});
