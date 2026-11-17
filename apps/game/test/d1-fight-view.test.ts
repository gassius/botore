/**
 * D1 — Fight View arena-first controls: first-watch vs rewatch + mute wiring.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  calloutFromCommand,
  updateCalloutAttackContext,
} from '../src/fight-view/calloutFromCommand';
import { FIGHT_VIEW_ARENA_HEIGHT_RATIO, FIGHT_VIEW_KO_HOLD_MS } from '../src/fight-view/types';
import { ROUTE_TITLES } from '../src/first-run/routes';
import type { AnimationCommand } from '../src/replay-playback';

const fighters = [
  { characterId: 'player-hero', displayName: 'Chispa' },
  { characterId: 'opp-1', displayName: 'Sir Bot' },
] as const;

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

describe('D1 Fight View rename + layout constants', () => {
  it('route title is Fight View (never Fight Replay)', () => {
    expect(ROUTE_TITLES.Replay).toBe('Fight View');
    expect(ROUTE_TITLES.Replay).not.toMatch(/replay/i);
  });

  it('arena height ratio meets acceptance (≥ 72%)', () => {
    expect(FIGHT_VIEW_ARENA_HEIGHT_RATIO).toBeGreaterThanOrEqual(0.72);
    expect(FIGHT_VIEW_KO_HOLD_MS).toBe(1000);
  });
});

describe('D1 first-watch vs rewatch control sets', () => {
  const slot = readSource('src/first-run/slots/ReplaySlot.tsx');

  it('first watch has no Continue / play-pause scrubber / footer Mute', () => {
    expect(slot).not.toContain('Continue to result');
    expect(slot).not.toContain('replay-continue');
    expect(slot).not.toContain('ReplayAudioControls');
    expect(slot).not.toContain("label={muted ? 'Unmute' : 'Mute'}");
    expect(slot).not.toContain('testID="replay-mute"');
  });

  it('wires a single in-arena mute control to persisted toggleMute', () => {
    expect(slot).toContain('FightViewMuteControl');
    expect(slot).toContain('testID="fight-view-mute"');
    expect(slot).toContain('toggleMute');
  });

  it('rewatch exposes back + Replay band only', () => {
    expect(slot).toContain('fight-view-back');
    expect(slot).toContain('mode={fightViewMode}');
    expect(slot).toContain('FightViewBottomBand');
    expect(slot).toContain("fightViewMode === 'rewatch'");
  });

  it('first watch arms KO hold then Result handoff stub for D2', () => {
    expect(slot).toContain('FIGHT_VIEW_KO_HOLD_MS');
    expect(slot).toContain('handOffToResult');
    expect(slot).toContain('D2 stub');
    expect(slot).toContain("BackHandler.addEventListener('hardwareBackPress'");
  });

  it('ConfirmFight sets firstWatch; Result Watch again sets rewatch', () => {
    const confirm = readSource('src/first-run/slots/ConfirmFightSlot.tsx');
    const result = readSource('src/first-run/slots/FightResultSlot.tsx');
    expect(confirm).toContain("setFightViewMode('firstWatch')");
    expect(result).toContain("setFightViewMode('rewatch')");
  });

  it('player-facing first-watch copy never says Fight Replay', () => {
    expect(slot).not.toContain('Fight Replay');
    // Blocked path title is Fight View.
    expect(slot).toContain('Fight View');
  });
});

describe('D1 call-out mapping (no IDs / checksums)', () => {
  it('maps heavy damage to a Heavy hit call-out with display names', () => {
    const attack: AnimationCommand = {
      kind: 'attack_anim',
      actor: 'player-hero',
      attack: 'weapon',
      heavyPhase: 'strike',
    };
    const ctx = updateCalloutAttackContext(attack, { lastAttackerId: null, wasHeavy: false });
    expect(ctx.wasHeavy).toBe(true);
    const damage: AnimationCommand = {
      kind: 'damage_pop',
      target: 'opp-1',
      amount: 20,
      hpAfter: 40,
    };
    const callout = calloutFromCommand(damage, fighters, ctx);
    expect(callout?.headline).toBe('Heavy hit!');
    expect(callout?.detail).toContain('Chispa');
    expect(callout?.detail).toContain('Sir Bot');
    expect(callout?.detail).not.toContain('player-hero');
    expect(callout?.detail).not.toContain('opp-1');
  });

  it('maps KO / dodge without leaking character ids', () => {
    const ko = calloutFromCommand({ kind: 'defeat_anim', characterId: 'opp-1' }, fighters);
    expect(ko?.headline).toBe('KO!');
    expect(ko?.detail).toBe('Sir Bot is down');
    const dodge = calloutFromCommand({ kind: 'dodge_anim', actor: 'player-hero' }, fighters);
    expect(dodge?.headline).toBe('Dodge!');
    expect(dodge?.detail).toContain('Chispa');
  });
});

describe('D1 arena-first player wiring', () => {
  it('CanonicalReplayPlayer supports arenaFirst layout without below-stage chrome', () => {
    const player = readSource('src/replay/CanonicalReplayPlayer.tsx');
    expect(player).toContain("layoutMode?: 'classic' | 'arenaFirst'");
    expect(player).toContain('arenaOverlay');
    expect(player).toContain('onCommandApplied');
  });
});
