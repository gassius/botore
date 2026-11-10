/**
 * C15 — labelled AuthEntry DEV assist (prefill + developer copy).
 * Imported only from the gated branch in authEntryPresentation.
 * Design-capture / EXPO_PUBLIC_ALLOW_DEV_SCAFFOLD builds only.
 */

import type { AuthEntryAuthKind, AuthEntryPresentation } from './authEntryPresentation';

export const AUTH_ENTRY_DEV_EMAIL = 'dev@botore.local';
export const AUTH_ENTRY_DEV_PASSWORD = 'dev-password';

export const AUTH_ENTRY_DEV_FOOTNOTE =
  'Public anon key only — no service-role credentials. RLS + save_bot_loadout remain authoritative.';

const PLAYER_SUBTITLE = 'Sign in to open your stable.';

function subtitleFor(authKind: AuthEntryAuthKind): string {
  if (authKind === 'dev') return `${PLAYER_SUBTITLE} DEV auth scaffold.`;
  if (authKind === 'unavailable') return `${PLAYER_SUBTITLE} Backend required.`;
  return `${PLAYER_SUBTITLE} Supabase Auth.`;
}

export function getDevAuthEntryPresentation(authKind: AuthEntryAuthKind): AuthEntryPresentation {
  return {
    email: AUTH_ENTRY_DEV_EMAIL,
    password: AUTH_ENTRY_DEV_PASSWORD,
    subtitle: subtitleFor(authKind),
    footnote: AUTH_ENTRY_DEV_FOOTNOTE,
    showDevAssist: true,
  };
}
