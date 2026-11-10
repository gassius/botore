/**
 * Botore privacy policy disclosure copy (R6).
 *
 * Engineering draft for store readiness — not a law-firm engagement.
 * Keep in sync with `docs/legal/privacy-policy.md`.
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
  'This notice explains how Botore uses platform identity (Game Center / Play Games), device-fallback sign-in, sessions, crash reports, and account deletion. It is an engineering disclosure for store readiness, not legal advice.';

export const privacyPolicySections: readonly PrivacyPolicySection[] = [
  {
    id: 'identity',
    title: 'Platform identity and sign-in',
    paragraphs: [
      'On iOS, Botore may request a Game Center identity proof. On Android, Botore may request a Play Games Services identity proof when Play Games is configured.',
      'Those proofs are sent to Botore’s server (Supabase Edge Function platform-auth), which verifies them and creates or restores a Botore account linked to that platform id. The client does not write identity rows directly.',
      'If a platform proof is unavailable, Botore may use a random device-stored UUID (iOS Keychain / Android Block Store) as a temporary device-fallback identity. Botore does not use IDFV or ANDROID_ID for this fallback.',
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
      'Sign out clears the local session. A deleted or banned Auth user cannot keep using the old session.',
    ],
  },
  {
    id: 'data',
    title: 'What we store',
    paragraphs: [
      'Botore stores account and profile data (such as a display name), characters and loadouts, fight allowances, and append-only inventory and battle ledgers needed to run the game.',
      'Platform identity mappings (provider + platform id → account) are stored server-side so the same Game Center / Play Games id returns to the same account until deletion.',
      'On preview and production builds, Botore may send crash and uncaught-error reports to Sentry when a DSN is configured. Crash reporting is not a product analytics stack; local development does not require a Sentry account. Reports are scrubbed to avoid passwords, tokens, cookies, and email-shaped fields where possible.',
    ],
  },
  {
    id: 'deletion',
    title: 'Account deletion',
    paragraphs: [
      `You can request deletion in the app (Stable → Delete account until Settings ships) or on the public web path ${DOCUMENTED_ACCOUNT_DELETE_PATH} using a one-time deletion code minted in-app.`,
      'Deletion soft-deletes the account, anonymizes display names, unlinks platform identities / devices / consents, and rewrites the Auth user so the same Game Center or Play Games id can mint a fresh account later.',
      'Hard-delete of every historical row is not possible: append-only ledgers and fight history remain as anonymous tombstones for integrity. See docs/backend/account-deletion.md once R5 lands.',
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
    title: 'Store listing and public URLs',
    paragraphs: [
      `Public privacy policy path: ${PUBLIC_PRIVACY_PATH}. Public account deletion path: ${DOCUMENTED_ACCOUNT_DELETE_PATH}.`,
      'Carlos attaches a custom domain (or otherwise SSO-free host) to the game web export so App Store / Play reviewers can open these URLs without Vercel SSO. Record the absolute URLs in R4 store listing materials.',
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    paragraphs: [
      'Questions about this disclosure: contact the Botore product owner (Carlos) through the store listing support channel once R4 publishes it.',
      'This document does not engage outside counsel unless Carlos asks.',
    ],
  },
];
