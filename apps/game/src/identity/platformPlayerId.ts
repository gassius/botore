/**
 * C16 — Platform player IDs must never appear in player-facing UI.
 *
 * Game Center `teamPlayerID`, Play Games `player_id`, device-fallback ids, and
 * synthetic `*@players.botore.internal` emails stay on the auth / Edge path.
 * Product surfaces (stable, ranking, settings, fight, replay) show display
 * names or botore character ids only.
 *
 * Internal logs may use {@link hashPlatformIdForLog} when correlation is needed.
 */

export const PLAYER_FACING_NAME_FALLBACK = 'Pilot';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * True when `value` looks like a platform / synthetic auth identifier that
 * must not be rendered as a player label.
 */
export function looksLikePlatformPlayerId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;

  // Synthetic Auth mailbox embeds the platform id (server-only).
  if (/@players\.botore\.internal$/i.test(v)) return true;
  if (/^(game_center|play_games|device_fallback)\./i.test(v)) return true;

  // Device-fallback store / proof ids (`device:<uuid>`).
  if (/^device:/i.test(v)) return true;

  // Game Center legacy player id / teamPlayerID shapes.
  if (/^G:\d+$/i.test(v)) return true;
  // Opaque teamPlayerID is commonly a UUID.
  if (UUID_RE.test(v)) return true;

  // Play Games `player_id` is typically a long numeric string.
  if (/^\d{10,}$/.test(v)) return true;

  // Literal field-name leakage must never become a nameplate.
  if (/^(teamPlayerID|player_id|platformId|platform_id)$/i.test(v)) return true;

  // Edge / fixture platform ids used in platform-auth tests.
  if (/^T:[A-Za-z0-9._-]+$/.test(v)) return true;
  if (/^pgs(-player)?-[A-Za-z0-9._-]+$/i.test(v)) return true;
  if (/^pgs-\d+$/i.test(v)) return true;

  return false;
}

/**
 * Resolve a player-facing label. Platform ids and empty values become the
 * fallback (default {@link PLAYER_FACING_NAME_FALLBACK}).
 */
export function playerFacingDisplayName(
  raw: string | null | undefined,
  fallback: string = PLAYER_FACING_NAME_FALLBACK,
): string {
  if (raw == null) return fallback;
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  if (looksLikePlatformPlayerId(trimmed)) return fallback;
  return trimmed;
}

/**
 * Non-cryptographic FNV-1a 32-bit hex for internal log correlation only.
 * Never show this (or the raw id) in product UI.
 */
export function hashPlatformIdForLog(platformId: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < platformId.length; i += 1) {
    h ^= platformId.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `pid:${(h >>> 0).toString(16).padStart(8, '0')}`;
}
