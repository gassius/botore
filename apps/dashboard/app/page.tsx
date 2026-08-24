import { dailyActiveAccounts, battleStats, replayCompletionRate, fetchHealth, recentBattles } from '@/lib/data';

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ border: '1px solid #1f2733', borderRadius: 8, padding: 16, minWidth: 180 }}>
      <div style={{ fontSize: 12, color: '#8b98ab' }}>{label}</div>
      <div style={{ fontSize: 24, marginTop: 4 }}>{value}</div>
    </div>
  );
}

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const [health, dau, stats, replayRate, recent] = await Promise.all([
    fetchHealth(),
    dailyActiveAccounts(7),
    battleStats(),
    replayCompletionRate(),
    recentBattles(10),
  ]);

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section>
        <h2>Service health</h2>
        <div style={{ display: 'flex', gap: 12 }}>
          <Stat label="API" value={health.api ? 'up' : 'down'} />
          <Stat label="Worker" value={health.worker ? 'up' : 'down'} />
        </div>
      </section>

      <section>
        <h2>Daily active accounts (7d)</h2>
        <table cellPadding={6} style={{ borderCollapse: 'collapse' }}>
          <tbody>
            {dau.map((d) => (
              <tr key={d.day}>
                <td style={{ color: '#8b98ab' }}>{d.day}</td>
                <td>{d.accounts}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section>
        <h2>Battles</h2>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <Stat label="Total battles" value={String(stats.totalBattles)} />
          <Stat
            label="Player win rate"
            value={stats.winRate === null ? '—' : `${Math.round(stats.winRate * 100)}%`}
          />
          <Stat
            label="Allowance utilization"
            value={
              stats.allowanceUtilization === null
                ? '—'
                : `${Math.round(stats.allowanceUtilization * 100)}%`
            }
          />
          <Stat
            label="Replay completion"
            value={replayRate === null ? '—' : `${Math.round(replayRate * 100)}%`}
          />
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
              <th>checksum</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((b) => (
              <tr key={b.battleId}>
                <td style={{ fontFamily: 'monospace' }}>{b.battleId.slice(0, 8)}…</td>
                <td>{new Date(b.endedAt).toLocaleTimeString()}</td>
                <td>{b.winnerId ?? 'draw'}</td>
                <td>{b.endReason}</td>
                <td>{b.checksumOk === null ? 'missing' : b.checksumOk ? 'ok' : 'INVALID'}</td>
              </tr>
            ))}
            {recent.length === 0 && (
              <tr>
                <td colSpan={5} style={{ color: '#8b98ab' }}>
                  No battles yet — run a fight against the local API.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
