/**
 * D1 — Fight View arena-first controls: first-watch vs rewatch + mute wiring.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  calloutFromCommand,
  updateCalloutAttackContext,
} from '../src/fight-view/calloutFromCommand';
import {
  createOnceHandoff,
  resolveFirstRunGoBackTarget,
  shouldScheduleKoHandoff,
} from '../src/fight-view/fightViewNavigation';
import { coverSceneToViewport } from '../src/arena/scenePlacement';
import {
  FIGHT_VIEW_ARENA_HEIGHT_RATIO,
  FIGHT_VIEW_BAND_CONTENT_HEIGHT,
  FIGHT_VIEW_HUD_BELOW_INSET,
  FIGHT_VIEW_KO_HOLD_MS,
  fightViewShellHeights,
} from '../src/fight-view/types';
import { prevRoute, ROUTE_TITLES } from '../src/first-run/routes';
import type { AnimationCommand } from '../src/replay-playback';
import { buildDesignCaptureUrl, parseDesignCaptureUrl } from '../src/design-capture/captureEnv';

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
    expect(FIGHT_VIEW_HUD_BELOW_INSET).toBeGreaterThan(80);
  });

  it('390×844 shell: arena ≥75% with fixed band hugging bottom', () => {
    const shell = fightViewShellHeights(844, FIGHT_VIEW_BAND_CONTENT_HEIGHT);
    expect(shell.arenaRatio).toBeGreaterThanOrEqual(0.75);
    expect(shell.arenaHeight + shell.bandHeight).toBe(844);
    // Cover fill: backdrop width ≥ phone width at that arena height.
    const cover = coverSceneToViewport(390, shell.arenaHeight);
    expect(cover.width).toBeGreaterThanOrEqual(390);
    expect(cover.height).toBeGreaterThanOrEqual(shell.arenaHeight);
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

  it('rewatch exposes back + replay-controls band', () => {
    expect(slot).toContain('fight-view-back');
    expect(slot).toContain('mode={fightViewMode}');
    expect(slot).toContain('FightViewBottomBand');
    expect(slot).toContain("fightViewMode === 'rewatch'");
  });

  it('offsets HUD + rewatch Back by safe-area top inset', () => {
    expect(slot).toContain('useSafeAreaInsets');
    expect(slot).toContain('topInset={topInset}');
    expect(slot).toContain('FIGHT_VIEW_HUD_BELOW_INSET');
  });

  it('arena flex:1 + fixed band height (no flexGrow cream gap)', () => {
    expect(slot).toMatch(/arena:\s*\{[^}]*flex:\s*1/s);
    expect(slot).toMatch(/band:\s*\{[^}]*flexGrow:\s*0/s);
    expect(slot).toContain('FIGHT_VIEW_BAND_CONTENT_HEIGHT');
    expect(slot).not.toContain('minHeight: 120');
  });

  it('keeps KO plate through quiet / victory_screen until Result handoff', () => {
    expect(slot).toContain('enqueueCallout');
    expect(slot).toContain('if (mapped)');
  });

  it('player uses arenaFirst cover so stage fills width', () => {
    const player = readSource('src/replay/CanonicalReplayPlayer.tsx');
    expect(player).toContain('coverSceneToViewport');
    expect(player).toContain('arenaFirst ? coverSceneToViewport');
  });

  it('parses fightView=rewatch capture deep link', () => {
    expect(parseDesignCaptureUrl('botore://capture/Replay?fightView=rewatch')).toEqual(
      expect.objectContaining({ route: 'Replay', fightViewMode: 'rewatch' }),
    );
    expect(buildDesignCaptureUrl('Replay', { fightViewMode: 'rewatch' })).toContain(
      'fightView=rewatch',
    );
  });

  it('ConfirmFight sets firstWatch; Result Watch again sets rewatch', () => {
    const confirm = readSource('src/first-run/slots/ConfirmFightSlot.tsx');
    const result = readSource('src/first-run/slots/FightResultSlot.tsx');
    const replay = readSource('src/first-run/slots/ReplaySlot.tsx');
    expect(confirm).toContain("setFightViewMode('firstWatch')");
    expect(result).toContain("setFightViewMode('rewatch')");
    expect(replay).toContain("setFightViewMode('rewatch')");
  });

  it('player-facing first-watch copy never says Fight Replay', () => {
    expect(slot).not.toContain('Fight Replay');
    expect(slot).toContain('Fight View');
  });
});

describe('D1 goBack routing (behavioural)', () => {
  it('first-watch Replay goBack is a noop', () => {
    expect(resolveFirstRunGoBackTarget('Replay', 'firstWatch', prevRoute('Replay'))).toBeNull();
  });

  it('rewatch Replay goBack stays on Replay (D2 overlay reopen; not ConfirmFight)', () => {
    expect(resolveFirstRunGoBackTarget('Replay', 'rewatch', prevRoute('Replay'))).toBeNull();
    expect(prevRoute('Replay')).toBe('ConfirmFight');
  });

  it('Settings goBack returns Stable', () => {
    expect(resolveFirstRunGoBackTarget('Settings', 'firstWatch', null)).toBe('Stable');
  });

  it('Opponents goBack returns Ludus (Stable), never Customise', () => {
    expect(prevRoute('Opponents')).toBe('Stable');
    expect(resolveFirstRunGoBackTarget('Opponents', 'firstWatch', prevRoute('Opponents'))).toBe(
      'Stable',
    );
    expect(resolveFirstRunGoBackTarget('Opponents', 'firstWatch', 'Customise')).toBe('Stable');
  });

  it('Customise goBack returns Ludus (Stable) as side-entry', () => {
    expect(resolveFirstRunGoBackTarget('Customise', 'firstWatch', null)).toBe('Stable');
    expect(resolveFirstRunGoBackTarget('Customise', 'firstWatch', 'Opponents')).toBe('Stable');
  });

  it('other routes use the linear prev when present', () => {
    expect(
      resolveFirstRunGoBackTarget('ConfirmFight', 'firstWatch', prevRoute('ConfirmFight')),
    ).toBe('Opponents');
  });
});

describe('D1 KO hold → Result handoff (behavioural)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('first watch schedules handoff; rewatch never does', () => {
    expect(shouldScheduleKoHandoff('firstWatch')).toBe(true);
    expect(shouldScheduleKoHandoff('rewatch')).toBe(false);
  });

  it('hands off exactly once after the KO hold on first watch', () => {
    vi.useFakeTimers();
    const handOff = vi.fn();
    const once = createOnceHandoff(handOff);

    if (shouldScheduleKoHandoff('firstWatch')) {
      setTimeout(once, FIGHT_VIEW_KO_HOLD_MS);
    }
    expect(handOff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(FIGHT_VIEW_KO_HOLD_MS - 1);
    expect(handOff).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(handOff).toHaveBeenCalledTimes(1);
    once();
    once();
    expect(handOff).toHaveBeenCalledTimes(1);
  });

  it('rewatch never arms a KO handoff timer', () => {
    vi.useFakeTimers();
    const handOff = vi.fn();
    const once = createOnceHandoff(handOff);
    if (shouldScheduleKoHandoff('rewatch')) {
      setTimeout(once, FIGHT_VIEW_KO_HOLD_MS);
    }
    vi.advanceTimersByTime(FIGHT_VIEW_KO_HOLD_MS * 5);
    expect(handOff).not.toHaveBeenCalled();
  });
});

describe('D1 call-out mapping (no IDs / checksums)', () => {
  it('strike phase is Heavy strike!, not a confirmed Heavy hit!', () => {
    const strike: AnimationCommand = {
      kind: 'attack_anim',
      actor: 'player-hero',
      attack: 'weapon',
      heavyPhase: 'strike',
    };
    const callout = calloutFromCommand(strike, fighters);
    expect(callout?.headline).toBe('Heavy strike!');
    expect(callout?.headline).not.toBe('Heavy hit!');
    expect(callout?.detail).toContain('Chispa');
  });

  it('maps heavy damage_pop to Heavy hit! with display names', () => {
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

  it('strike then dodge never claims a Heavy hit', () => {
    const strike: AnimationCommand = {
      kind: 'attack_anim',
      actor: 'player-hero',
      attack: 'weapon',
      heavyPhase: 'strike',
    };
    expect(calloutFromCommand(strike, fighters)?.headline).toBe('Heavy strike!');
    const dodge = calloutFromCommand({ kind: 'dodge_anim', actor: 'opp-1' }, fighters);
    expect(dodge?.headline).toBe('Dodge!');
    expect(dodge?.headline).not.toBe('Heavy hit!');
  });

  it('victory_screen callout is null (slot keeps prior KO plate)', () => {
    expect(
      calloutFromCommand({ kind: 'victory_screen', winner: 'player-hero' }, fighters),
    ).toBeNull();
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
