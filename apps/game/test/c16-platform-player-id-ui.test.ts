import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  PLAYER_FACING_NAME_FALLBACK,
  looksLikePlatformPlayerId,
  playerFacingDisplayName,
} from '../src/identity/platformPlayerId';
import { rankingRowAccessibilityLabel } from '../src/ranking/rankingSession';
import type { RankingRow } from '../src/ranking/types';
import { FixtureRankingReadAdapter } from '../src/ranking/adapters/FixtureRankingReadAdapter';

/** Representative Game Center / Play Games / device-fallback ids from C12 fixtures. */
const PLATFORM_IDS = [
  'T:hero',
  'T:ok',
  'G:1234567890',
  'pgs-1',
  'pgs-player-9',
  'device:abc',
  'device:test-id',
  '550e8400-e29b-41d4-a716-446655440000',
  '123456789012345',
  // Common Play Games player_id form (`g` + digits).
  'g01234567890123456789',
  'game_center.T_hero@players.botore.internal',
  'play_games.pgs-1@players.botore.internal',
  'teamPlayerID',
  'player_id',
  'platformId',
] as const;

const SAFE_NAMES = [
  'Pilot',
  'Hero',
  'Sir Bot',
  'DEV · BOLT',
  'player-hero',
  'opp-sir-bot',
  'Deleted',
] as const;

/** Product surfaces that must never render or bind platform ids. */
const PRODUCT_UI_SOURCES = [
  'src/screens/RankingScreen.tsx',
  'src/first-run/slots/SettingsSlot.tsx',
  'src/first-run/slots/RankingSlot.tsx',
  'src/garage/screens/StableScreen.tsx',
  'src/garage/screens/AuthEntryScreen.tsx',
  'src/garage/screens/CustomiseScreen.tsx',
  'src/garage/screens/DeleteAccountScreen.tsx',
  'src/fight/screens/OpponentsScreen.tsx',
  'src/fight/screens/ConfirmFightScreen.tsx',
  'src/settings/usePlayerSettings.ts',
  'src/settings/prefs.ts',
] as const;

const FORBIDDEN_UI_LITERALS = ['teamPlayerID', 'player_id', '@players.botore.internal'] as const;

describe('C16 platform player id UI guards', () => {
  it('detects Game Center / Play Games / device-fallback / synthetic shapes', () => {
    for (const id of PLATFORM_IDS) {
      expect(looksLikePlatformPlayerId(id), id).toBe(true);
      expect(playerFacingDisplayName(id)).toBe(PLAYER_FACING_NAME_FALLBACK);
      expect(playerFacingDisplayName(id)).not.toContain(id);
    }
  });

  it('keeps display names and botore character ids', () => {
    for (const name of SAFE_NAMES) {
      expect(looksLikePlatformPlayerId(name), name).toBe(false);
      expect(playerFacingDisplayName(name)).toBe(name);
    }
    expect(playerFacingDisplayName(null)).toBe(PLAYER_FACING_NAME_FALLBACK);
    expect(playerFacingDisplayName('   ')).toBe(PLAYER_FACING_NAME_FALLBACK);
    expect(playerFacingDisplayName('T:hero', 'player-hero')).toBe('player-hero');
  });

  it('redacts platform ids from ranking accessibility labels and fixture rows', async () => {
    const poisoned: RankingRow = {
      rank: 1,
      botId: 'bot-gc',
      displayName: 'T:hero',
      isCurrentBot: true,
      source: 'dev-fixture',
    };
    expect(rankingRowAccessibilityLabel(poisoned)).not.toContain('T:hero');
    expect(rankingRowAccessibilityLabel(poisoned)).toContain(PLAYER_FACING_NAME_FALLBACK);

    const rows = await new FixtureRankingReadAdapter({ rows: [poisoned] }).list();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.displayName).toBe(PLAYER_FACING_NAME_FALLBACK);
    expect(JSON.stringify(rows)).not.toContain('T:hero');
  });

  it('product UI sources do not embed Game Center / Play Games id field literals', () => {
    for (const relative of PRODUCT_UI_SOURCES) {
      const source = readFileSync(join(process.cwd(), relative), 'utf8');
      for (const forbidden of FORBIDDEN_UI_LITERALS) {
        expect(source, `${relative} must not contain ${forbidden}`).not.toContain(forbidden);
      }
      // Bindings that would dump platformId into JSX/Text are banned on these surfaces.
      expect(source, `${relative} must not reference platformId`).not.toMatch(/\bplatformId\b/);
    }
  });

  it('Nameplate and ranking session helpers always sanitize before render paths', () => {
    // Source-level: Nameplate must call playerFacingDisplayName (last-line UI guard).
    const nameplate = readFileSync(join(process.cwd(), 'src/garage-tag/Nameplate.tsx'), 'utf8');
    expect(nameplate).toContain('playerFacingDisplayName');
    expect(nameplate).toContain('safeName');

    const rankingSession = readFileSync(
      join(process.cwd(), 'src/ranking/rankingSession.ts'),
      'utf8',
    );
    expect(rankingSession).toContain('playerFacingDisplayName');

    const rankingAdapter = readFileSync(
      join(process.cwd(), 'src/ranking/adapters/SupabaseRankingReadAdapter.ts'),
      'utf8',
    );
    expect(rankingAdapter).toContain('playerFacingDisplayName');

    const settingsSlot = readFileSync(
      join(process.cwd(), 'src/first-run/slots/SettingsSlot.tsx'),
      'utf8',
    );
    expect(settingsSlot).not.toMatch(/teamPlayerID|player_id|platformId|players\.botore/);
  });

  it('player-facing Stable / Confirm / Replay copy does not show ticket or asset ids', () => {
    const stable = readFileSync(join(process.cwd(), 'src/garage/screens/StableScreen.tsx'), 'utf8');
    expect(stable).not.toMatch(/LAST SERVER-CONFIRMED|last server-confirmed loadout/i);
    expect(stable).not.toContain('Domain F8');
    expect(stable).not.toContain('paint-crimson');

    const confirm = readFileSync(
      join(process.cwd(), 'src/fight/screens/ConfirmFightScreen.tsx'),
      'utf8',
    );
    expect(confirm).not.toContain('confirm-arena-note');
    expect(confirm).not.toMatch(/Arena \/ FX land with F10/);
    expect(confirm).not.toMatch(/not from REF samples/);

    const replaySlot = readFileSync(
      join(process.cwd(), 'src/first-run/slots/ReplaySlot.tsx'),
      'utf8',
    );
    expect(replaySlot).not.toContain('DomainNote');
    expect(replaySlot).not.toMatch(/Domain: F10/);

    const player = readFileSync(
      join(process.cwd(), 'src/replay/CanonicalReplayPlayer.tsx'),
      'utf8',
    );
    expect(player).not.toMatch(/env \{media\.environmentVersion\}/);
    expect(player).not.toMatch(/nearLoadout\.paint/);
    expect(player).not.toContain('environment-v001');
    expect(player).toContain('playerFacingDisplayName(nearFighter.displayName)');
  });
});
