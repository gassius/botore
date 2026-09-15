import { describe, it, expect } from 'vitest';
import { createSha256Rng, deriveSeed, seedToKeyMaterial } from '@botore/rng';
import { simulateBattle } from '@botore/combat-engine';
import { SEEDED_OPPONENTS, DEFAULT_PLAYER } from '@botore/test-fixtures';
import { compileAnimationQueue, PlaybackController, commandDuration } from '../src/replay-playback';
import {
  BattleReplayController,
  type ReplayStage,
  type StageNode,
} from '../src/BattleReplayController';

function fixtureReplay(): Record<string, unknown> {
  const seed = deriveSeed('game/fixture/1');
  const replay = simulateBattle({
    battleId: 'game-fixture',
    seed,
    attacker: { ...DEFAULT_PLAYER },
    defender: { ...SEEDED_OPPONENTS[0]! },
    rng: createSha256Rng(seedToKeyMaterial(seed)),
  });
  return JSON.parse(JSON.stringify(replay)) as Record<string, unknown>;
}

describe('replay playback (headless)', () => {
  it('compiles a replay into an ordered animation queue', () => {
    const queue = compileAnimationQueue(fixtureReplay());
    expect(queue[0]).toMatchObject({ kind: 'show_battle' });
    expect(queue.at(-1)).toMatchObject({ kind: 'victory_screen' });
    expect(queue.length).toBeGreaterThan(4);
  });

  it('fails closed on malformed replay payloads', () => {
    expect(() => compileAnimationQueue({ bogus: true })).toThrow();
    expect(() => compileAnimationQueue(null)).toThrow();
  });

  it('playback controller advances deterministically and finishes', () => {
    const queue = compileAnimationQueue(fixtureReplay());
    const pb = new PlaybackController(queue);
    expect(pb.total).toBe(queue.length);
    let steps = 0;
    while (!pb.finished && steps < 1000) {
      const cmd = pb.advance();
      expect(cmd).not.toBeNull();
      steps += 1;
    }
    expect(pb.finished).toBe(true);
    expect(steps).toBe(queue.length);
  });

  it('controller executes the full timeline against the stage', () => {
    const mkNode = (name: string): StageNode & { attrs: Map<string, unknown> } => {
      const attrs = new Map<string, unknown>();
      return {
        name,
        active: false,
        attrs,
        getChildByName: () => null,
        setAttribute: (k, v) => void attrs.set(k, v),
      };
    };
    const stage: ReplayStage = {
      attacker: mkNode(DEFAULT_PLAYER.characterId),
      defender: mkNode(SEEDED_OPPONENTS[0]!.characterId),
      attackerHpBar: mkNode('attacker-hp'),
      defenderHpBar: mkNode('defender-hp'),
      banner: mkNode('banner'),
      resultPanel: mkNode('result'),
    };
    const controller = new BattleReplayController(stage);
    const total = controller.load(fixtureReplay());
    expect(total).toBeGreaterThan(0);

    let now = 0;
    let guard = 0;
    while (controller.update(16, now) && guard < 10_000) {
      now += 16;
      guard += 1;
    }
    expect(controller.update(16, now + 5000)).toBe(false);
    expect(stage.resultPanel.active).toBe(true);
    const winner = (stage.resultPanel as StageNode & { attrs?: Map<string, unknown> }).attrs?.get(
      'winner',
    );
    expect(['player-hero', SEEDED_OPPONENTS[0]!.characterId, 'draw']).toContain(winner);
    void commandDuration;
  });
});
