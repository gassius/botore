/**
 * Botore privacy policy — player-facing disclosure copy (R6).
 *
 * Keep player text free of internal ops notes. Engineering / store-readiness
 * notes live in `docs/legal/privacy-policy.md` only.
 * Deletion claims assume this branch is stacked on R5 (#55).
 */

import { DOCUMENTED_ACCOUNT_DELETE_PATH, PUBLIC_PRIVACY_PATH } from './privacyPaths';

export type PrivacyPolicySection = {
  readonly id: string;
  readonly title: string;
  readonly paragraphs: readonly string[];
};

/** Human-readable last-updated stamp for in-app + public web. */
export const PRIVACY_POLICY_LAST_UPDATED = '10 November 2026';

export const PRIVACY_POLICY_TITLE = 'Botore Privacy Policy';

export const PRIVACY_POLICY_INTRO =
  'This notice explains how Botore uses platform identity (Game Center / Play Games), device-fallback sign-in, sessions, crash reports, and account deletion.';

export const privacyPolicySections: readonly PrivacyPolicySection[] = [
  {
    id: 'identity',
    title: 'Platform identity and sign-in',
    paragraphs: [
      'On iOS, Botore may request a Game Center identity proof. On Android, Botore may request a Play Games Services identity proof when Play Games is configured.',
      'Those proofs are sent to Botore’s server (Supabase Edge Function platform-auth), which verifies them and creates or restores a Botore account linked to that platform id. The client does not write identity rows directly.',
      'If a platform proof is unavailable, Botore may use a random device-stored UUID in secure on-device storage (iOS Keychain / Android Keystore) as a temporary device-fallback identity. Botore does not use IDFV or ANDROID_ID for this fallback.',
      'Web preview uses a separate Development password path and is not the store native sign-in flow.',
    ],
  },
  {
    id: 'synthetic-email',
    title: 'Synthetic server emails',
    paragraphs: [
      'Platform-auth mints Supabase Auth sessions with server-generated synthetic email addresses of the form *@players.botore.internal.',
      'These addresses are not player-supplied email addresses and are not used to contact you. They exist so Auth can issue a session after a verified Game Center, Play Games, or device-fallback proof.',
    ],
  },
  {
    id: 'session',
    title: 'Session handling',
    paragraphs: [
      'After a successful sign-in, Botore stores a Supabase access and refresh token on the device so you can relaunch without proving identity again while the session remains valid.',
      'Sign out clears the local session. If an Auth user is deleted or banned, refresh is blocked; any already-issued access token expires shortly afterward (typically within about one hour).',
    ],
  },
  {
    id: 'data',
    title: 'What we store',
    paragraphs: [
      'Botore stores account and profile data (such as a display name), characters and loadouts, fight allowances, and append-only inventory and battle ledgers needed to run the game.',
      'Platform identity mappings (provider + platform id → account) are stored server-side so the same Game Center / Play Games id returns to the same account until deletion.',
      'On preview and production builds, Botore may send crash and uncaught-error reports to Sentry when a DSN is configured. Crash reporting is not a product analytics stack. Events may include stack traces, breadcrumbs, device model, OS version, and app version; they are scrubbed to avoid passwords, tokens, cookies, and email-shaped fields where possible. Sentry is a processor and may store those reports outside the European Union.',
    ],
  },
  {
    id: 'deletion',
    title: 'Account deletion',
    paragraphs: [
      `You can request deletion in the app (Stable → Delete account until Settings ships) or on the public web path ${DOCUMENTED_ACCOUNT_DELETE_PATH} using a one-time deletion code minted in-app.`,
      'Deletion soft-deletes the account, anonymizes display names, unlinks platform identities / devices / consents, and rewrites the Auth user so the same Game Center or Play Games id can mint a fresh account later.',
      'Hard-delete of every historical row is not possible: append-only ledgers and fight history remain as anonymous tombstones for integrity.',
    ],
  },
  {
    id: 'retention',
    title: 'Data retention',
    paragraphs: [
      'Active account and gameplay data are kept while the account is in use.',
      'After deletion, identity links are removed and the account is marked deleted; anonymized ledger and battle tombstones may be retained indefinitely for fairness and audit integrity.',
      'Crash report retention follows the configured Sentry project policy when crash reporting is enabled.',
    ],
  },
  {
    id: 'store',
    title: 'Public privacy and deletion URLs',
    paragraphs: [
      `Public privacy policy path: ${PUBLIC_PRIVACY_PATH}. Public account deletion path: ${DOCUMENTED_ACCOUNT_DELETE_PATH}.`,
      'Processors that may see player data include Supabase (database, Auth, Edge Functions), Sentry (crash reports), Vercel (hosts the public privacy and deletion pages), and Apple or Google when you sign in with Game Center or Play Games.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [
      'Questions about this notice or your data: use the support channel listed on the Botore App Store or Google Play listing.',
      'You may also request access to, correction of, or deletion of personal data we hold about your account through that channel.',
    ],
  },
];
