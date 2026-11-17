/**
 * Plain-language Customise save failures — never show raw RPC / HTTP codes.
 */

export type LoadoutSaveErrorInput = {
  readonly code?: string | null | undefined;
  readonly message?: string | null | undefined;
};

const DEFAULT_SAVE_FAILURE = 'Could not save changes. Your equipped loadout is unchanged.';

/**
 * Map adapter / PostgREST failure fields into a short player-facing sentence.
 */
export function loadoutSavePlayerMessage(input: LoadoutSaveErrorInput): string {
  const code = (input.code ?? '').trim().toLowerCase();
  const raw = (input.message ?? '').trim();
  const message = raw.toLowerCase();

  if (
    code === 'network_error' ||
    code === 'offline' ||
    code === 'timeout' ||
    message.includes('network request failed') ||
    message.includes('failed to fetch')
  ) {
    return 'You appear to be offline. Check your connection and try again.';
  }

  if (
    code === 'unauthenticated' ||
    code === 'auth_expired' ||
    code === 'session_expired' ||
    code === 'http_401' ||
    message.includes('session expired') ||
    message.includes('jwt expired')
  ) {
    return 'Your session expired. Sign in again to save.';
  }

  if (code.includes('unpublished_atlas') || message.includes('unpublished_atlas_version')) {
    return 'This paint and weapon pack is not ready to save yet. Try again later.';
  }

  if (
    code.includes('unowned_part') ||
    message.includes('unowned_part') ||
    message.includes('does not own')
  ) {
    return 'You do not own that part yet. Your equipped loadout is unchanged.';
  }

  if (
    code.includes('slot_mismatch') ||
    message.includes('slot_mismatch') ||
    message.includes('unknown_part') ||
    message.includes('inactive_part')
  ) {
    return 'That part cannot be equipped. Your equipped loadout is unchanged.';
  }

  if (
    code.includes('forbidden') ||
    message.includes('forbidden') ||
    message.includes('ownership')
  ) {
    return 'You cannot change this bot. Your equipped loadout is unchanged.';
  }

  if (
    code === 'playable_misconfigured' ||
    message.includes('misconfigured') ||
    message.includes('not configured')
  ) {
    return 'Saving is unavailable in this build. Your equipped loadout is unchanged.';
  }

  if (code === 'invalid_response' || code.startsWith('http_') || message.length === 0) {
    return DEFAULT_SAVE_FAILURE;
  }

  // SQLSTATE (e.g. 42501) or PostgREST (PGRST*) — never surface raw server text.
  const codeRaw = (input.code ?? '').trim();
  if (/^[0-9A-Z]{5}$/i.test(codeRaw) || /^PGRST/i.test(codeRaw)) {
    return DEFAULT_SAVE_FAILURE;
  }

  // Prefer an already plain adapter message; strip machine prefixes when present.
  if (/^[a-z0-9_]+:/i.test(raw)) {
    return DEFAULT_SAVE_FAILURE;
  }

  // Never show unmatched server / RPC text on a player-facing screen.
  return DEFAULT_SAVE_FAILURE;
}
