import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { checksumStatus, formatRate, parseAdminDashboardSnapshot } from '../lib/data';

const here = dirname(fileURLToPath(import.meta.url));

describe('admin dashboard snapshot parsing (B3)', () => {
  it('parses the B2 snapshot shape used by the UI', () => {
    const snap = parseAdminDashboardSnapshot({
      ok: true,
      service: 'admin-dashboard',
      health: { status: 'ok', service: 'backend', checks: { database: true } },
      outbox: { status: 'ok', pending: 0, failing: 0, dead_lettered: 0 },
      fightStats: {
        total_battles: 2,
        initiator_win_rate: 0.5,
        allowance_utilization_today: null,
        replay_completion_rate: 1,
        player_count: 1,
        opponent_bot_count: 3,
      },
      dailyActiveAccounts: [{ utc_day: '2026-11-10', accounts: 1 }],
      players: [{ account_id: 'a' }],
      bots: [{ character_id: 'c' }],
      atlasVersions: [{ version: 'v1', status: 'published' }],
      cronJobs: [{ jobname: 'botore-outbox-drain' }],
      cronJobRuns: [],
      recentBattles: [
        {
          battle_id: '11111111-1111-1111-1111-111111111111',
          ended_at: '2026-11-10T12:00:00.000Z',
          winner_id: null,
          end_reason: 'timeout',
          replay_checksum: 'a'.repeat(64),
          outbox_pending: false,
        },
      ],
      checkedAt: '2026-11-10T12:00:00.000Z',
    });

    expect(snap.ok).toBe(true);
    expect(snap.health?.status).toBe('ok');
    expect(snap.dailyActiveAccounts[0]?.accounts).toBe(1);
    expect(snap.recentBattles[0]?.battle_id.startsWith('11111111')).toBe(true);
    expect(checksumStatus(snap.recentBattles[0]?.replay_checksum ?? null)).toBe('ok');
    expect(formatRate(snap.fightStats.initiator_win_rate)).toBe('50%');
    expect(formatRate(null)).toBe('—');
  });

  it('does not treat Fastify API/WORKER health URLs as the health SoT', () => {
    const source = readFileSync(join(here, '../lib/data.ts'), 'utf8');
    expect(source).toContain('admin_dashboard_snapshot');
    expect(source).toContain('/functions/v1/health');
    expect(source).not.toMatch(/process\.env\[['\"]API_HEALTH_URL['\"]\]/);
    expect(source).not.toMatch(/process\.env\[['\"]WORKER_HEALTH_URL['\"]\]/);
    expect(source).not.toMatch(/SERVICE_ROLE_KEY|serviceRole|createClient\(/);
    expect(source).not.toMatch(/from ['"]@supabase\//);
  });
});
