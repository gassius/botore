/**
 * Derive allowance remaining from server-returned fight_allowances rows.
 * Do NOT filter by the device calendar — SQL eligibility uses server UTC.
 */
export function summarizeAllowanceRows(
  rows: ReadonlyArray<{ utc_day?: unknown; used_at?: unknown }>,
): { utcDay: string; allowancesRemaining: number } {
  let latestDay: string | null = null;
  for (const row of rows) {
    if (typeof row.utc_day !== 'string' || row.utc_day.length < 1) continue;
    if (!latestDay || row.utc_day > latestDay) latestDay = row.utc_day;
  }
  if (!latestDay) {
    return { utcDay: '', allowancesRemaining: 0 };
  }
  let remaining = 0;
  for (const row of rows) {
    if (row.utc_day !== latestDay) continue;
    if (row.used_at === null || row.used_at === undefined) remaining += 1;
  }
  return { utcDay: latestDay, allowancesRemaining: remaining };
}
