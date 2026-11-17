/**
 * C17 — Player-facing Fight View / Result / Customise / Ranking must never
 * render UUIDs, checksums, raw character ids, or known debug strings.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { BattleOutcome } from '@botore/replay';
import { PLAYER_FACING_NAME_FALLBACK } from '../src/identity/platformPlayerId';
import { paintDisplayLabel, weaponDisplayLabel } from '../src/garage/loadout/proofCatalogue';
import { fighterDisplayName, formatOutcomeLine } from '../src/replay/confirmedResult';

const UUID_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i;

/** Surfaces named in C17 widened scope (Carlos APK review 2026-11-17). */
const PLAYER_FACING_SOURCES = [
  'src/replay/CanonicalReplayPlayer.tsx',
  'src/replay/FightResultContent.tsx',
  'src/first-run/slots/FightResultSlot.tsx',
  'src/first-run/slots/ReplaySlot.tsx',
  'src/fight-view/FightViewHud.tsx',
  'src/fight-view/FightViewBottomBand.tsx',
  'src/fight-view/FightViewMuteControl.tsx',
  'src/fight-view/calloutFromCommand.ts',
  'src/screens/ReplaySlotScreen.tsx',
  'src/screens/FightResultSlotScreen.tsx',
  'src/garage/screens/CustomiseScreen.tsx',
  'src/screens/RankingScreen.tsx',
  'src/garage-tag/ReplayAudioControls.tsx',
] as const;

/** Substrings that must never appear inside string / template / JSX text literals. */
const FORBIDDEN_LITERAL_SNIPPETS = [
  'Server confirmed',
  'DEV recorded fixture',
  'DEV — not server-confirmed',
  'LIVE ·',
  'Live ·',
  'DEV FIXTURES',
  'NOT LIVE PLAYERS',
  'DEV fixture',
  'Domain: F10',
  'combat-v1',
  'paint-crimson',
  'paint-cobalt',
  'player-hero',
  'Winner: player-hero',
  'same checksum on repeat',
  'checksum ',
  'Battle ',
  'Reduced motion on',
  'outcomes preserved',
  'reduced-motion',
] as const;

const STRING_LITERAL_RE = /(['"`])((?:\\.|(?!\1)[\s\S])*?)\1/g;
const JSX_TEXT_RE = />([^<>{]+)</g;

function readSource(relative: string): string {
  return readFileSync(join(process.cwd(), relative), 'utf8');
}

/** Strip block/line comments so comment docs do not trip the guard. */
function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
}

function collectPlayerFacingText(source: string): string[] {
  const cleaned = stripComments(source);
  const out: string[] = [];
  for (const match of cleaned.matchAll(STRING_LITERAL_RE)) {
    out.push(match[2] ?? '');
  }
  for (const match of cleaned.matchAll(JSX_TEXT_RE)) {
    const text = (match[1] ?? '').trim();
    if (text) out.push(text);
  }
  return out;
}

describe('C17 player-facing id / debug scrub', () => {
  it('formatOutcomeLine / fighterDisplayName never emit raw character ids or UUIDs', () => {
    const fighters = [
      { characterId: 'player-hero', displayName: 'Hero' },
      { characterId: 'opp-sir-bot', displayName: 'Sir Bot' },
    ] as const;
    const defeat: BattleOutcome = {
      winner: 'player-hero',
      loser: 'opp-sir-bot',
      reason: 'defeat',
    };
    const line = formatOutcomeLine(defeat, fighters);
    expect(line).toBe('Winner: Hero');
    expect(line).not.toContain('player-hero');
    expect(formatOutcomeLine(defeat)).toBe(`Winner: ${PLAYER_FACING_NAME_FALLBACK}`);
    expect(fighterDisplayName('player-hero', fighters)).toBe('Hero');
    expect(fighterDisplayName('player-hero')).toBe(PLAYER_FACING_NAME_FALLBACK);

    // Poisoned displayName === character id / UUID must not leak.
    const poisoned = [
      {
        characterId: '550e8400-e29b-41d4-a716-446655440000',
        displayName: '550e8400-e29b-41d4-a716-446655440000',
      },
      { characterId: 'player-hero', displayName: 'player-hero' },
    ] as const;
    expect(fighterDisplayName(poisoned[0]!.characterId, poisoned)).toBe(
      PLAYER_FACING_NAME_FALLBACK,
    );
    expect(fighterDisplayName('player-hero', poisoned)).toBe(PLAYER_FACING_NAME_FALLBACK);
    expect(formatOutcomeLine(defeat, poisoned)).not.toMatch(/player-hero|550e8400/i);
  });

  it('part display labels never echo catalogue ids', () => {
    expect(paintDisplayLabel('paint-crimson')).toBe('Oxide');
    expect(paintDisplayLabel('paint-cobalt')).toBe('Petrol');
    expect(paintDisplayLabel('paint-oxide')).toBe('Oxide');
    expect(paintDisplayLabel('paint-petrol')).toBe('Petrol');
    expect(weaponDisplayLabel('weapon-sword')).toBe('Sword');
    expect(weaponDisplayLabel('weapon-axe')).toBe('Axe');
  });

  it('Fight View / Result / Customise / Ranking literals ban UUID + known debug strings', () => {
    for (const relative of PLAYER_FACING_SOURCES) {
      const texts = collectPlayerFacingText(readSource(relative));
      for (const text of texts) {
        expect(text, `${relative} literal must not embed a UUID`).not.toMatch(UUID_RE);
        for (const forbidden of FORBIDDEN_LITERAL_SNIPPETS) {
          expect(
            text,
            `${relative} literal must not contain ${JSON.stringify(forbidden)}: ${JSON.stringify(text)}`,
          ).not.toContain(forbidden);
        }
      }
    }
  });

  it('end-of-replay card path formats outcome without checksum chrome', () => {
    const player = stripComments(readSource('src/replay/CanonicalReplayPlayer.tsx'));
    expect(player).toContain('formatOutcomeLine(result.outcome, result.replay.fighters)');
    expect(player).toContain('fighterDisplayName(nearFighter.characterId');
    expect(player).toContain('inline-result');
    expect(player).not.toMatch(/checksum\s*\{/);
    expect(player).not.toContain('Server confirmed');
    expect(player).not.toContain('playerFacingDisplayName');
    expect(player).not.toContain('reduced-motion');
    expect(player).not.toMatch(/muted\s*·/);
  });

  it('Result content shows bot display names and part labels only', () => {
    const result = stripComments(readSource('src/replay/FightResultContent.tsx'));
    expect(result).toContain('paintDisplayLabel');
    expect(result).toContain('weaponDisplayLabel');
    expect(result).toContain('fighterDisplayName');
    expect(result).toContain("badge={isDraw ? 'Result' : 'Winner'}");
    expect(result).not.toMatch(/Battle\s*\{/);
    expect(result).not.toMatch(/checksum\s*\{/);
    expect(result).not.toContain('DomainNote');
    expect(result).not.toContain('battleId');
    expect(result).not.toContain('replayChecksum');
  });

  it('Customise has no confirmed-id chrome (E1 dropped summary; no version UUID)', () => {
    const customise = stripComments(readSource('src/garage/screens/CustomiseScreen.tsx'));
    expect(customise).not.toContain('customise-confirmed-summary');
    expect(customise).not.toContain('confirmedVersionId');
    expect(customise).not.toMatch(/Confirmed\s+\{/);
    expect(customise).not.toContain('paint-crimson');
  });

  it('Ranking rows do not show Live / DEV source chrome', () => {
    const ranking = stripComments(readSource('src/screens/RankingScreen.tsx'));
    expect(ranking).not.toContain('ranking-dev-banner');
    expect(ranking).not.toContain('DEV FIXTURES');
    expect(ranking).not.toMatch(/sourceLabel\s*=/);
    expect(ranking).toContain('row.totalXp');
    expect(ranking).toContain(' XP');
  });

  it('Fight Result slot has no DomainNote debug chrome', () => {
    const slot = stripComments(readSource('src/first-run/slots/FightResultSlot.tsx'));
    expect(slot).not.toContain('DomainNote');
    expect(slot).not.toContain('Domain: F10');
    expect(slot).not.toContain('combat-v1');
  });

  it('ReplayAudioControls has no reduced-motion developer note', () => {
    const controls = stripComments(readSource('src/garage-tag/ReplayAudioControls.tsx'));
    expect(controls).not.toContain('Reduced motion on');
    expect(controls).not.toContain('outcomes preserved');
    expect(controls).not.toContain('motionNote');
    expect(controls).not.toContain('reducedMotion');
  });
});
