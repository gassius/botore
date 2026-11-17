/**
 * C16 / C17 — Platform player IDs and raw internal bot ids must never appear
 * in player-facing UI.
 *
 * Game Center `teamPlayerID`, Play Games `player_id`, device-fallback ids,
 * synthetic `*@players.botore.internal` emails, UUIDs (incl. nil / embedded),
 * long hex runs, checksums, and seeded character ids (`player-hero`, `opp-*`)
 * stay off nameplates. Product surfaces show human display names only
 * (fallback {@link PLAYER_FACING_NAME_FALLBACK}).
 */

export const PLAYER_FACING_NAME_FALLBACK = 'Pilot';

/** Any UUID shape, including nil (`00000000-…`) — not RFC version-gated. */
const UUID_ANYWHERE_RE = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** Opaque hex id run (checksum / botore-player-<hex> fragments). */
const LONG_HEX_RUN_RE = /[0-9a-f]{24,}/i;

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
  // Opaque teamPlayerID / embedded UUID (incl. nil).
  if (UUID_ANYWHERE_RE.test(v)) return true;

  // Play Games `player_id`: long numeric, or common `g` + digits form.
  if (/^\d{10,}$/.test(v)) return true;
  if (/^g\d{10,}$/i.test(v)) return true;

  // Literal field-name leakage must never become a nameplate.
  if (/^(teamPlayerID|player_id|platformId|platform_id)$/i.test(v)) return true;

  // Edge / fixture platform ids used in platform-auth tests.
  if (/^T:[A-Za-z0-9._-]+$/.test(v)) return true;
  if (/^pgs(-player)?-[A-Za-z0-9._-]+$/i.test(v)) return true;
  if (/^pgs-\d+$/i.test(v)) return true;

  return false;
}

/**
 * True when `value` is a raw botore / catalogue / checksum id that must never
 * render as a player-facing name (C17).
 */
export function looksLikeInternalCharacterId(value: string): boolean {
  const v = value.trim();
  if (!v) return false;
  if (looksLikePlatformPlayerId(v)) return true;

  // Seeded proof / opponent character ids.
  if (/^player-hero$/i.test(v)) return true;
  if (/^(player|opp|bot)-[a-z0-9-]+$/i.test(v)) return true;

  // Catalogue part ids accidentally bound as labels.
  if (/^(paint|weapon|chassis|shield|drone)-[a-z0-9-]+$/i.test(v)) return true;

  // Checksum / opaque hex runs (whole label or embedded, 24+ hex).
  if (LONG_HEX_RUN_RE.test(v)) return true;

  return false;
}

/**
 * Resolve a player-facing label. Platform ids, raw character ids, empty values,
 * and forbidden fallbacks become {@link PLAYER_FACING_NAME_FALLBACK}.
 */
export function playerFacingDisplayName(
  raw: string | null | undefined,
  fallback: string = PLAYER_FACING_NAME_FALLBACK,
): string {
  if (raw == null) {
    return sanitizeFallback(fallback);
  }
  const trimmed = raw.trim();
  if (!trimmed || looksLikeInternalCharacterId(trimmed)) {
    return sanitizeFallback(fallback);
  }
  return trimmed;
}

function sanitizeFallback(fallback: string): string {
  const fb = fallback.trim();
  if (!fb || looksLikeInternalCharacterId(fb)) {
    return PLAYER_FACING_NAME_FALLBACK;
  }
  return fb;
}
