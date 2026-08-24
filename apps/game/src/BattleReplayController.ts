/**
 * BattleReplayController — Cocos Creator adapter.
 *
 * IMPORTANT: this file is copied (or symlinked) into the Creator project's
 * assets/scripts/ directory. It compiles INSIDE Creator 3.x, which provides
 * the `cc` module. In this repository it is typechecked with `cc` declared
 * as an ambient module (see src/cc-ambient.d.ts) so CI can validate logic
 * without the editor.
 *
 * The controller consumes the shared replay schema and executes the
 * animation queue against scene nodes. It contains NO gameplay logic.
 */
import { compileAnimationQueue, PlaybackController, commandDuration, type AnimationCommand } from './replay-playback.js';

/** Minimal node surface the controller needs; satisfied by cc.Node. */
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

/**
 * Placeholder shapes policy (repo-owned, no external art):
 * characters are simple colored rectangles/sprites; HP bars are scaled
 * rectangles; text labels are system-font Labels.
 */
export class BattleReplayController {
  private playback: PlaybackController | null = null;
  private waitMs = 0;

  constructor(private readonly stage: ReplayStage) {}

  /** Loads and validates a replay payload; fails closed on invalid data. */
  load(rawReplay: unknown): number {
    const queue = compileAnimationQueue(rawReplay);
    this.playback = new PlaybackController(queue);
    this.apply({ kind: 'show_battle', attacker: '', defender: '' }); // reset stage
    return this.playback.total;
  }

  /**
   * Advances playback, executing due commands. `now` is the adapter clock
   * (e.g. performance.now()); returns true while playing, false when finished.
   */
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
        if (this.stage.banner.setAttribute) this.stage.banner.setAttribute('text', cmd.actor);
        break;
      case 'attack_anim':
        // Adapter maps to tween: lunge toward opponent. Placeholder: no-op transform.
        break;
      case 'dodge_anim':
        // Adapter maps to tween: quick sidestep + afterimage. Placeholder no-op.
        break;
      case 'damage_pop': {
        const target = cmd.target === this.stage.defender.name ? this.stage.defenderHpBar : this.stage.attackerHpBar;
        if (target.setAttribute) target.setAttribute('hpRatio', cmd.hpAfter);
        break;
      }
      case 'defeat_anim':
        const defeated = cmd.characterId === this.stage.defender.name ? this.stage.defender : this.stage.attacker;
        // defeat visual handled by adapter tweens; keep node active for layout
        void defeated;
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
