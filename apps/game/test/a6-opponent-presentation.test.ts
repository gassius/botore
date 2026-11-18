/**
 * Art Director blocker: Opponents card and Tale of the Tape must share one
 * presentation resolver (loadout + art source + labels) for every opponent.
 */
import { describe, expect, it } from 'vitest';
import { A6_OPPONENT_BAKES } from '../src/garage-tag/a6OpponentMatch';
import {
  a6BakeCatalogueLoadout,
  resolveOpponentPresentation,
} from '../src/garage-tag/a6OpponentPresentation';
import { resolveA6OpponentPanel } from '../src/fight/opponents/a6OpponentPanelAssets';
import { resolveA6OpponentPanelSlug } from '../src/fight/opponents/a6OpponentPanelResolve';
import { buildTapeRows, formatTapeRecord } from '../src/fight/taleOfTheTape';
import { paintDisplayLabel, weaponDisplayLabel } from '../src/garage/loadout/proofCatalogue';

describe('shared Opponents / ToTT opponent presentation', () => {
  it('Can Hook uses A6 bake primer+Hook on both paths (not seed oxide+dagger / Spear tape)', () => {
    const seedMismatch = {
      characterId: 'opp-dex-bot',
      displayName: 'Can Hook',
      paintId: 'paint-crimson',
      weaponId: 'weapon-dagger',
    };
    const opponents = resolveOpponentPresentation(seedMismatch);
    const tott = resolveOpponentPresentation(seedMismatch);
    expect(opponents).toEqual(tott);
    expect(opponents.npcId).toBe('can-hook');
    expect(opponents.usePanelArt).toBe(true);
    expect(opponents.paintId).toBe('paint-primer');
    expect(opponents.weaponId).toBe('weapon-spear');
    expect(opponents.weaponLabel).toBe('Hook');
    expect(opponents.paintLabel).toBe('Primer');
    expect(a6BakeCatalogueLoadout(A6_OPPONENT_BAKES['can-hook'])).toEqual({
      paintId: 'paint-primer',
      weaponId: 'weapon-spear',
    });
    expect(resolveA6OpponentPanelSlug(seedMismatch)).toBe('can-hook');
    expect(resolveA6OpponentPanel(seedMismatch)).not.toBeNull();
    expect(resolveA6OpponentPanel(seedMismatch)).toBe(
      resolveA6OpponentPanel({
        ...seedMismatch,
        paintId: opponents.paintId,
        weaponId: opponents.weaponId,
      }),
    );
  });

  it('card↔ToTT parity: roster W–L + Hook weapon label share one resolver', () => {
    const card = {
      characterId: 'opp-dex-bot',
      displayName: 'Can Hook',
      paintId: 'paint-primer',
      weaponId: 'weapon-spear',
      wins: 19,
      losses: 2,
    };
    const presentation = resolveOpponentPresentation(card);
    expect(presentation.weaponLabel).toBe('Hook');
    expect(presentation.paintLabel).toBe('Primer');
    const tape = buildTapeRows({
      playerPaint: 'paint-crimson',
      playerWeapon: 'weapon-sword',
      opponentPaint: presentation.paintId,
      opponentWeapon: presentation.weaponId,
      playerRecord: '13W–6L',
      opponentRecord: formatTapeRecord(card.wins, card.losses),
      playerWinStreak: '3',
      opponentWinStreak: '3',
      playerLevel: '4',
      opponentLevel: '4',
      weaponLabel: weaponDisplayLabel,
      paintLabel: paintDisplayLabel,
      opponentWeaponLabel: presentation.weaponLabel,
      opponentPaintLabel: presentation.paintLabel,
    });
    const record = tape.find((r) => r.label === 'Record');
    const weapon = tape.find((r) => r.label === 'Weapon');
    expect(record?.them).toBe('19W–2L');
    expect(weapon?.them).toBe('Hook');
    expect(weapon?.them).not.toBe('Spear');
  });

  it('aligned seed loadouts still share the same presentation as Opponents/ToTT', () => {
    const roster = [
      {
        characterId: 'opp-dex-bot',
        displayName: 'Can Hook',
        paintId: 'paint-primer',
        weaponId: 'weapon-spear',
        npcId: 'can-hook' as const,
        weaponLabel: 'Hook',
      },
      {
        characterId: 'opp-hp-bot',
        displayName: 'Cobalt Brute',
        paintId: 'paint-navy',
        weaponId: 'weapon-mace',
        npcId: 'cobalt-brute' as const,
        weaponLabel: 'Mace',
      },
      {
        characterId: 'opp-sir-bot',
        displayName: 'Slab Mick',
        paintId: 'paint-cinder',
        weaponId: 'weapon-mace',
        npcId: 'slab-mick' as const,
        weaponLabel: 'Mace',
      },
    ];
    for (const row of roster) {
      const presentation = resolveOpponentPresentation(row);
      expect(presentation.npcId).toBe(row.npcId);
      expect(presentation.paintId).toBe(row.paintId);
      expect(presentation.weaponId).toBe(row.weaponId);
      expect(presentation.weaponLabel).toBe(row.weaponLabel);
      expect(presentation.usePanelArt).toBe(true);
      expect(resolveA6OpponentPanel(row)).not.toBeNull();
    }
  });

  it('unknown opponents keep candidate loadout and skip panel art', () => {
    const input = {
      characterId: 'opp-unknown',
      displayName: 'Sir Bot',
      paintId: 'paint-cobalt',
      weaponId: 'weapon-sword',
    };
    const sir = resolveOpponentPresentation(input);
    expect(sir.npcId).toBeNull();
    expect(sir.usePanelArt).toBe(false);
    expect(sir.paintId).toBe('paint-cobalt');
    expect(sir.weaponId).toBe('weapon-sword');
    expect(sir.weaponLabel).toBe('Sword');
    expect(resolveA6OpponentPanelSlug(input)).toBeNull();
    expect(resolveA6OpponentPanel(input)).toBeNull();
  });
});
