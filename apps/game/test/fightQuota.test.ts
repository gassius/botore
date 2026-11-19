import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveA6OpponentPanelSlug } from '../src/fight/opponents/a6OpponentPanelResolve';
import {
  applyDesignCaptureFightQuotaScenario,
  formatRefillCountdown,
  msUntilRefill,
  parseFightQuotaSummary,
} from '../src/fight/quota/fightQuotaTypes';

afterEach(() => {
  vi.useRealTimers();
});

describe('E3 fight quota parse + countdown', () => {
  it('parses full server contract without client-compiled limit', () => {
    const quota = parseFightQuotaSummary({
      ok: true,
      fightsRemaining: 1,
      limit: 5,
      scope: 'bot',
      refillPolicy: 'rolling_per_fight',
      nextRefillAt: '2026-11-18T14:00:00Z',
      utcDay: '2026-11-18',
      allowancesRemaining: 1,
    });
    expect(quota).toEqual({
      fightsRemaining: 1,
      limit: 5,
      scope: 'bot',
      refillPolicy: 'rolling_per_fight',
      nextRefillAt: '2026-11-18T14:00:00Z',
      utcDay: '2026-11-18',
      allowancesRemaining: 1,
    });
  });

  it('keeps pre-E3 allowancesRemaining/utcDay bodies usable', () => {
    const quota = parseFightQuotaSummary({
      ok: true,
      utcDay: '2026-11-09',
      allowancesRemaining: 3,
    });
    expect(quota?.fightsRemaining).toBe(3);
    expect(quota?.utcDay).toBe('2026-11-09');
    expect(quota?.refillPolicy).toBe('daily_utc_midnight');
  });

  it('formats countdown from nextRefillAt only', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-18T12:00:00.000Z'));
    expect(msUntilRefill('2026-11-18T14:30:05Z')).toBe((2 * 3600 + 30 * 60 + 5) * 1000);
    expect(formatRefillCountdown((2 * 3600 + 30 * 60 + 5) * 1000)).toBe('02:30:05');
    expect(formatRefillCountdown(0)).toBe('00:00:00');
  });

  it('treats full quota as remaining >= limit for UI Full state', () => {
    const quota = parseFightQuotaSummary({
      ok: true,
      fightsRemaining: 3,
      limit: 3,
      scope: 'player',
      refillPolicy: 'daily_utc_midnight',
      nextRefillAt: '2026-11-19T00:00:00Z',
      utcDay: '2026-11-18',
      allowancesRemaining: 3,
    });
    expect(quota).not.toBeNull();
    expect(quota!.fightsRemaining >= quota!.limit).toBe(true);
  });

  it('exposes exhausted remaining=0 with nextRefillAt for hero countdown', () => {
    const quota = parseFightQuotaSummary({
      ok: true,
      fightsRemaining: 0,
      limit: 3,
      scope: 'player',
      refillPolicy: 'daily_utc_midnight',
      nextRefillAt: '2026-11-19T00:00:00Z',
      utcDay: '2026-11-18',
      allowancesRemaining: 0,
    });
    expect(quota?.fightsRemaining).toBe(0);
    expect(quota?.nextRefillAt).toBe('2026-11-19T00:00:00Z');
  });

  it('forces design-capture remaining to 2/3 with a future countdown (not Full)', () => {
    const now = Date.parse('2026-11-19T12:00:00.000Z');
    const forced = applyDesignCaptureFightQuotaScenario(
      'remaining',
      {
        allowancesRemaining: 3,
        quota: {
          fightsRemaining: 3,
          limit: 3,
          scope: 'player',
          refillPolicy: 'daily_utc_midnight',
          nextRefillAt: '2026-11-19T00:00:00Z', // already due — still must show countdown
          utcDay: '2026-11-19',
          allowancesRemaining: 3,
        },
      },
      now,
    );
    expect(forced.allowancesRemaining).toBe(2);
    expect(forced.quota?.fightsRemaining).toBe(2);
    expect(forced.quota?.limit).toBe(3);
    expect(forced.quota!.fightsRemaining < forced.quota!.limit).toBe(true);
    expect(Date.parse(forced.quota!.nextRefillAt)).toBeGreaterThan(now);
  });

  it('forces design-capture exhausted to 0 while keeping limit', () => {
    const forced = applyDesignCaptureFightQuotaScenario('exhausted', {
      allowancesRemaining: 2,
      quota: {
        fightsRemaining: 2,
        limit: 3,
        scope: 'player',
        refillPolicy: 'daily_utc_midnight',
        nextRefillAt: '2026-11-20T00:00:00Z',
        utcDay: '2026-11-19',
        allowancesRemaining: 2,
      },
    });
    expect(forced.allowancesRemaining).toBe(0);
    expect(forced.quota?.fightsRemaining).toBe(0);
    expect(forced.quota?.limit).toBe(3);
    expect(forced.quota?.nextRefillAt).toBe('2026-11-20T00:00:00Z');
  });

  it('leaves quota untouched when no design-capture fightQuota scenario', () => {
    const input = {
      allowancesRemaining: 3,
      quota: {
        fightsRemaining: 3,
        limit: 3,
        scope: 'player' as const,
        refillPolicy: 'daily_utc_midnight' as const,
        nextRefillAt: '2026-11-20T00:00:00Z',
        utcDay: '2026-11-19',
        allowancesRemaining: 3,
      },
    };
    expect(applyDesignCaptureFightQuotaScenario(null, input)).toEqual(input);
  });

  it('resolves opponent panel slug from A6 NPC identity (shared Opponents/ToTT)', () => {
    expect(
      resolveA6OpponentPanelSlug({
        characterId: 'slab-mick',
        displayName: 'Slab Mick',
        paintId: 'paint-cinder',
        weaponId: 'weapon-mace',
      }),
    ).toBe('slab-mick');
    // Display-name identity wins over mismatched seed loadout (Can Hook bake).
    expect(
      resolveA6OpponentPanelSlug({
        characterId: 'opp-dex-bot',
        displayName: 'Can Hook',
        paintId: 'paint-crimson',
        weaponId: 'weapon-dagger',
      }),
    ).toBe('can-hook');
    // Sir Bot is not an A6 NPC — no panel alias onto slab-mick / cobalt-brute
    expect(
      resolveA6OpponentPanelSlug({
        characterId: 'opp-sir-bot',
        displayName: 'Sir Bot',
        paintId: 'paint-cobalt',
        weaponId: 'weapon-sword',
      }),
    ).toBeNull();
    expect(
      resolveA6OpponentPanelSlug({
        paintId: 'paint-cobalt',
        weaponId: 'weapon-sword',
      }),
    ).toBeNull();
  });
});
