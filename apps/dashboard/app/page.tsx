import {
  checksumStatus,
  fetchDashboardHealth,
  fetchDashboardSnapshot,
  formatRate,
} from '@/lib/data';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #1f2733', borderRadius: 8, padding: 16, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: '#8b98ab' }}>{label}</div>
      <div style={{ fontSize: 24, marginTop: 4 }}>{value}</div>
    </div>
  );
}

function checkSummary(checks: Record<string, unknown>): string {
  const keys = Object.keys(checks);
  if (keys.length === 0) return '—';
  const edge = checks['edge_functions'];
  const parts: string[] = [];
  for (const key of keys) {
    if (key === 'edge_functions') continue;
    const val = checks[key];
    if (typeof val === 'boolean') parts.push(`${key}:${val ? 'ok' : 'fail'}`);
    else if (val && typeof val === 'object' && 'ok' in (val as object)) {
      parts.push(`${key}:${(val as { ok?: unknown }).ok ? 'ok' : 'fail'}`);
    } else {
      parts.push(key);
    }
  }
  if (edge && typeof edge === 'object' && edge !== null) {
    const peers = Object.entries(edge as Record<string, unknown>)
      .map(([name, info]) => {
        const reachable =
          typeof info === 'object' &&
          info !== null &&
          'reachable' in info &&
          Boolean((info as { reachable?: unknown }).reachable);
        return `${name}:${reachable ? 'up' : 'down'}`;
      })
      .join(', ');
    if (peers) parts.push(`edge[${peers}]`);
  }
  return parts.slice(0, 8).join(' · ') || '—';
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const snapshot = await fetchDashboardSnapshot();
  const health = await fetchDashboardHealth(snapshot.health);
  const stats = snapshot.fightStats;
  const dau = snapshot.dailyActiveAccounts.slice(-7);
  const recent = snapshot.recentBattles.slice(0, 10);
  // outbox_status_snapshot shape: { ok, outbox: { pending, ... }, cronJobs, checkedAt }
  const outboxEnvelope = snapshot.outbox ?? {};
  const outboxCounts =
    outboxEnvelope['outbox'] &&
    typeof outboxEnvelope['outbox'] === 'object' &&
    !Array.isArray(outboxEnvelope['outbox'])
      ? (outboxEnvelope['outbox'] as Record<string, unknown>)
      : outboxEnvelope;

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h2>Backend health</h2>
        <p style={{ color: '#8b98ab', fontSize: 13, marginTop: 0 }}>
          Source: {health.source}
          {health.httpStatus !== null ? ` (HTTP ${health.httpStatus})` : ''}
          {health.detail ? ` — ${health.detail}` : ''}
        </p>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat label="Status" value={health.status} />
          <Stat label="Service" value={health.service ?? '—'} />
          <Stat label="Checks" value={checkSummary(health.checks)} />
        </div>
      </section>

      <section>
        <h2>Outbox & cron</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat
            label="Outbox status"
            value={
              typeof outboxEnvelope['ok'] === 'boolean'
                ? outboxEnvelope['ok']
                  ? 'ok'
                  : 'error'
                : String(outboxEnvelope['status'] ?? '—')
            }
          />
          <Stat label="Pending" value={String(outboxCounts['pending'] ?? '—')} />
          <Stat label="Failing" value={String(outboxCounts['failing'] ?? '—')} />
          <Stat label="Dead-lettered" value={String(outboxCounts['dead_lettered'] ?? '—')} />
          <Stat label="Cron jobs" value={String(snapshot.cronJobs.length)} />
        </div>
      </section>

      <section>
        <h2>Daily active accounts (7d of 30)</h2>
        <table cellPadding={6} style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {dau.map((d) => (
              <tr key={d.utc_day}>
                <td style={{ color: '#8b98ab' }}>{d.utc_day}</td>
                <td>{d.accounts}</td>
              </tr>
            ))}
            {dau.length === 0 && (
              <tr>
                <td style={{ color: '#8b98ab' }}>No daily-active rows in snapshot.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Battles</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat label="Total battles" value={String(stats.total_battles ?? 0)} />
          <Stat label="Battles today" value={String(stats.battles_today ?? 0)} />
          <Stat label="Initiator win rate" value={formatRate(stats.initiator_win_rate)} />
          <Stat
            label="Allowance utilization (today)"
            value={formatRate(stats.allowance_utilization_today)}
          />
          <Stat label="Replay completion" value={formatRate(stats.replay_completion_rate)} />
          <Stat label="Players" value={String(stats.player_count ?? 0)} />
          <Stat label="Opponent bots" value={String(stats.opponent_bot_count ?? 0)} />
          <Stat label="Atlas versions" value={String(snapshot.atlasVersions.length)} />
        </div>
      </section>

      <section>
        <h2>Recent battles & replay checksum status</h2>
        <table cellPadding={6} style={{ borderCollapse: 'collapse', width: '100%' }}>
          <thead>
            <tr style={{ color: '#8b98ab', textAlign: 'left' }}>
              <th>battle</th>
              <th>ended</th>
              <th>winner</th>
              <th>reason</th>
              <th>atlas</th>
              <th>checksum</th>
              <th>outbox</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((b) => (
              <tr key={b.battle_id}>
                <td style={{ fontFamily: 'monospace' }}>{b.battle_id.slice(0, 8)}…</td>
                <td>{b.ended_at ? new Date(b.ended_at).toLocaleTimeString() : '—'}</td>
                <td>{b.winner_id ?? 'draw'}</td>
                <td>{b.end_reason ?? '—'}</td>
                <td>{b.attacker_atlas_version ?? '—'}</td>
                <td>{checksumStatus(b.replay_checksum)}</td>
                <td>{b.outbox_pending ? 'pending' : '—'}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={7} style={{ color: '#8b98ab' }}>
                  No battles yet — run a fight against Edge combat-v1.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
