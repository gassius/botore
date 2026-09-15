/**
 * BattleReplayController — React Native / Expo adapter.
 *
 * This file consumes the shared framework-free replay logic and provides
 * a React Native-compatible interface. The controller executes the animation
 * queue against StageNode implementations backed by React state.
 */
import {
  compileAnimationQueue,
  PlaybackController,
  commandDuration,
  type AnimationCommand,
} from './replay-playback';

export interface StageNode {
  name: string;
  active: boolean;
  getChildByName(name: string): StageNode | null;
  setAttribute?(key: string, value: string | number): void;
}

export interface ReplayStage {
  readonly attacker: StageNode;
  readonly defender: StageNode;
  readonly attackerHpBar: StageNode;
  readonly defenderHpBar: StageNode;
  readonly banner: StageNode;
  readonly resultPanel: StageNode;
}

export class BattleReplayController {
  private playback: PlaybackController | null = null;
  private waitMs = 0;

  constructor(private readonly stage: ReplayStage) {}

  load(rawReplay: unknown): number {
    const queue = compileAnimationQueue(rawReplay);
    this.playback = new PlaybackController(queue);
    this.apply({ kind: 'show_battle', attacker: '', defender: '' });
    return this.playback.total;
  }

  update(_deltaMs: number, now: number): boolean {
    if (!this.playback || this.playback.finished) return false;
    if (now < this.waitMs) return true;

    const cmd = this.playback.advance();
    if (!cmd) return false;
    this.apply(cmd);
    this.waitMs = now + commandDuration(cmd);
    return !this.playback.finished;
  }

  private apply(cmd: AnimationCommand): void {
    switch (cmd.kind) {
      case 'show_battle':
        this.stage.resultPanel.active = false;
        this.stage.attacker.active = true;
        this.stage.defender.active = true;
        break;
      case 'turn_banner':
        if (this.stage.banner.setAttribute) {
          this.stage.banner.setAttribute('text', cmd.actor);
        }
        break;
      case 'attack_anim':
        break;
      case 'dodge_anim':
        break;
      case 'damage_pop': {
        const target =
          cmd.target === this.stage.defender.name
            ? this.stage.defenderHpBar
            : this.stage.attackerHpBar;
        if (target.setAttribute) {
          target.setAttribute('hpRatio', cmd.hpAfter);
        }
        break;
      }
      case 'defeat_anim':
        break;
      case 'victory_screen':
        this.stage.resultPanel.active = true;
        if (this.stage.resultPanel.setAttribute) {
          this.stage.resultPanel.setAttribute('winner', cmd.winner ?? 'draw');
        }
        break;
    }
  }
}
