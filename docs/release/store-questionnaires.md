# Support, age rating, and data-safety drafts (R4)

Draft answers for App Store Connect and Google Play Console. **Not legal
advice.** Carlos reviews before paste. No secrets in this file.

Ticket: [R4](https://app.clickup.com/t/1amjtrey7vd). Privacy source of truth:
[`docs/legal/privacy-policy.md`](../legal/privacy-policy.md) + player copy in
`apps/game/src/legal/privacyPolicyContent.ts`. Deletion:
[`docs/backend/account-deletion.md`](../backend/account-deletion.md). Crash:
[`docs/architecture/crash-reporting.md`](../architecture/crash-reporting.md).

## Support URL / email (placeholders)

| Field | Draft value | Notes |
| ----- | ----------- | ----- |
| Support URL | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/privacy` (temporary) or a dedicated support page once hosted | Prefer a public, SSO-free URL |
| Support email | `REPLACE_WITH_SUPPORT_INBOX` | Carlos picks the real inbox; bake as `EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL` on the public web host for Play no-code deletion mailto |
| Marketing URL | optional — omit until marketing site exists | Non-goal for R4 |
| Privacy Policy URL | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/privacy` | Required |
| Account deletion URL | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/account/delete` | Play data-deletion / account deletion |

Until the custom domain is attached, leave console fields as drafts — do not
point reviewers at SSO-gated `*.vercel.app`.

## Age rating — App Store (draft)

Questionnaire theme: **robot / fantasy combat simulation**, no real-world
violence against people, no user-generated social chat in the first-run scope,
no gambling, no unrestricted web browsing, no IAP yet (do not invent IAP).

| Topic | Draft answer | Rationale |
| ----- | ------------ | --------- |
| Cartoon or Fantasy Violence | Infrequent / Mild | Robot-on-robot fight replay |
| Realistic Violence | None | |
| Sexual Content / Nudity | None | |
| Profanity / Crude Humor | None | |
| Horror / Fear Themes | None | |
| Mature / Suggestive Themes | None | |
| Alcohol / Tobacco / Drugs | None | |
| Gambling | None | No IAP / loot-box claims in this build |
| Unrestricted Web Access | No | |
| User Contests | No | |
| Age Assurance | Not required for this draft | Revisit if product adds UGC/chat |

**Expected bucket:** 9+ or 12+ depending on ASC violence mapping — Carlos
confirms in the live questionnaire. Do not claim “4+” if combat FX read as
more intense on device.

## Age rating — Play (draft)

| Question area | Draft |
| ------------- | ----- |
| Violence | Fantasy violence (robots); no blood/gore emphasis |
| Sexual content | None |
| Language | None |
| Controlled substances | None |
| Gambling / simulated gambling | None |
| User interaction | Users interact with the game; ranking is account-scoped — no open chat in first-run |
| Share location | No |
| Digital purchases | No (until product adds them) |

**Expected IARC bucket:** PEGI 7 / ESRB Everyone 10+ class outcomes are
plausible; accept whatever the Play questionnaire computes after Carlos
submits truthful answers.

## App Store privacy nutrition labels (draft)

Collect = yes when the listed data can leave the device for Botore /
processors. **Not used for tracking** (no ATT advertising tracking in this
build). **Not linked to identity for advertising.** Crash data only when
Sentry DSN is configured on the binary.

| Data type | Collect? | Linked to user? | Used for tracking? | Purpose |
| --------- | -------- | --------------- | ------------------ | ------- |
| Name (display name) | Yes | Yes (account) | No | App functionality |
| User ID (Botore account / platform id mapping) | Yes | Yes | No | App functionality |
| Gameplay content (loadouts, fights, ranking) | Yes | Yes | No | App functionality |
| Product interaction (operational, not marketing analytics) | Minimal / optional | Prefer No unless product analytics ships | No | App functionality |
| Crash data (Sentry) | Yes **if** DSN on | Prefer No (scrubber; no email) | No | App functionality / diagnostics |
| Diagnostics / performance | Only if added later | — | No | — |
| Contact info (email) | No player email for native platform-auth; synthetic `*@players.botore.internal` is server-only | — | No | — |
| Precise location | No | | | |
| Photos / contacts / etc. | No | | | |

**Third-party / processors to disclose in privacy policy (already in R6 copy):**
Supabase (Auth, DB, Edge), Sentry (crashes when enabled), Vercel (hosts
`/privacy` + `/account/delete`), Apple Game Center / Google Play Games
(identity proofs).

## Play Data safety form (draft)

| Section | Draft answer |
| ------- | ------------ |
| Does the app collect/share user data? | **Yes** — collects |
| Is all data encrypted in transit? | **Yes** (HTTPS to Supabase / hosts) |
| Can users request deletion? | **Yes** — in-app + `{origin}/account/delete` |
| Data sold? | **No** |
| Data shared for advertising? | **No** |
| Data used for fraud prevention / security / account mgmt | Yes as needed for Auth / integrity |
| Account deletion URL | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/account/delete` |
| Privacy policy URL | `{EXPO_PUBLIC_PUBLIC_WEB_ORIGIN}/privacy` |

### Data types collected (Play)

| Type | Collected | Shared | Required / optional | Purpose |
| ---- | --------- | ------ | ------------------- | ------- |
| Name | Yes (display name) | No (not shared with other companies for ads) | App functionality | Account / garage |
| User IDs | Yes (account + Game Center / Play Games platform ids server-side) | No ads | App functionality | Sign-in |
| App activity / gameplay | Yes | No ads | App functionality | Fights, ranking, ledgers |
| Crash logs | Yes when Sentry enabled | Shared with Sentry as processor | App functionality | Stability |
| Device IDs (ANDROID_ID / IDFV) | **No** for auth fallback | — | — | Device-fallback uses a random UUID in secure storage |
| Approximate location | No | | | |
| Financial info | No (no IAP in this build) | | | |

If a production binary ships **without** `EXPO_PUBLIC_SENTRY_DSN`, answer
crash logs **No** for that release and update the form when crash reporting
is turned on (R3).

## Export compliance / encryption (draft)

Standard HTTPS / TLS only; no custom crypto beyond platform and Supabase TLS.
ASC: typically **exempt** / uses only standard encryption — Carlos confirms
on the live form.

## Related

- Checklist: [`checklist.md`](./checklist.md)
- Listing copy + screenshots: [`store-listing.md`](./store-listing.md)
- R2 EAS / signing: [`docs/architecture/eas-production-credentials.md`](../architecture/eas-production-credentials.md)
