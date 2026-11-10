# Account deletion (R5)

Players can delete their Botore account **in-app** (authenticated) and via a
**public web URL** that redeems a one-time deletion code. Players who
uninstalled without minting a code can still request deletion from the same
URL (support mailto + ops runbook).

## Policy (soft-delete)

Append-only ledgers and non-cascade battle FKs **block hard-delete** of
`accounts` / `characters`. Deletion therefore:

1. Sets `accounts.deleted_at`
2. Anonymizes `profiles.display_name` and player `characters.display_name` →
   `Deleted`
3. Deletes `player_identities`, `devices`, and `consents` for the account
4. Nulls `battles.initiator_account_id` when it pointed at the account
5. Clears `accounts.deletion_code_hash`
6. Edge Auth Admin rewrites the Auth email to
   `deleted.<uuidcompact>@deleted.botore.internal` and bans the user (~100y)
   so the same Game Center / Play Games id can mint a **new** account later

Ledgers and historical battle rows remain as **anonymized tombstones** under
the same account UUID (kept for integrity — not erased).

## Schema / RPCs

Migration `0024_account_deletion.sql`:

| Callable                                  | Role            | Purpose                                                |
| ----------------------------------------- | --------------- | ------------------------------------------------------ |
| `mint_my_deletion_code()`                 | `authenticated` | One-time web code (plaintext once); stores sha256 hash |
| `delete_my_account()`                     | **none**        | Legacy DB-only helper; EXECUTE revoked (M1)            |
| `admin_delete_account(uuid)`              | `service_role`  | Edge JWT path                                          |
| `admin_delete_account_by_code_hash(text)` | `service_role`  | Edge web path                                          |

**M1:** clients must not call `delete_my_account()` — a DB-only delete leaves
the Auth user live and can re-link on the next platform sign-in. The only
player-facing path is Edge `account-delete`, which always runs Auth retire.
`platform-auth` also fail-closes with `account_deleted` when
`generateLink` resolves to a soft-deleted account.

No new client table `GRANT`s. `get_owned_character()` returns
`account_deleted` when `deleted_at` is set.

## Edge Function `account-delete`

```bash
pnpm exec supabase functions serve account-delete
deno test -A --config=supabase/functions/account-delete/deno.json \
  supabase/functions/account-delete
```

`config.toml`: `[functions.account-delete] verify_jwt = false` (auth inside
handler, same pattern as `combat-v1`).

### In-app (JWT)

```http
POST /functions/v1/account-delete
Authorization: Bearer <user access token>
Content-Type: application/json

{ "confirm": true }
```

**M2:** Auth Admin `signOut` receives the caller's **access JWT** (not the
user id). Response includes `sessionsRevoked: true|false` — never claim revoke
if the call failed. Ban still blocks refresh.

### Public web (deletion code)

```http
POST /functions/v1/account-delete
apikey: <anon>
Authorization: Bearer <anon>
Content-Type: application/json

{ "confirm": true, "deletionCode": "<32 hex, dashes optional>" }
```

Code path has no user JWT to revoke with; **the ban covers refresh**. Issued
access tokens remain valid until expiry (~1h) aside from RPCs that check
`deleted_at`.

Both require `confirm: true`.

## Public web URL

Path (game web export): **`/account/delete`**

Documented production host once Carlos attaches a **custom domain** to the
`botore-game` Vercel project (or otherwise disables SSO for anonymous
reviewers). Until then `*.vercel.app` may require Vercel SSO and is **not**
store-reviewer friendly.

In-app: Stable → **Delete account** → optional **Mint web deletion code**,
then type `DELETE` to confirm. When C9 Settings merges, move the entry under
Settings and keep Stable as a temporary affordance only if needed.

### No-code fallback (Play policy)

`/account/delete` also offers **No code? Request deletion** — a support form
that opens a mailto with contact email + Game Center / Play Games player id.

Bake `EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL` on the game web / store host
so the mailto target is set. Until that env is present, the form explains that
support is not configured and points ops here.

Client helpers: `apps/game/src/garage/auth/accountDeleteClient.ts`,
`deletionSupportContact.ts`.

## Ops runbook (manual delete)

Use when a player requests deletion without a code (support inbox), or when
`auth_retire_failed` left DB soft-deleted but Auth live.

1. **Identify** the account UUID:
   - Prefer `player_identities` lookup by provider + platform id (if still
     linked).
   - Else match support evidence (platform id, approximate display name,
     fight times) under service role.
2. **Soft-delete** (service role):
   ```sql
   select public.admin_delete_account('<account-uuid>'::uuid);
   ```
   Idempotent: repeated calls return `{ ok: true, repeated: true, … }`.
3. **Auth retire** (service role / Auth Admin API):
   - `updateUserById`: email → `deleted.<uuidcompact>@deleted.botore.internal`,
     `ban_duration: '876000h'`, `email_confirm: true`.
   - If the player still has a live access JWT, `auth.admin.signOut(jwt,
'global')`. Otherwise document that ban covers refresh only.
4. **Verify**:
   - `accounts.deleted_at` set; profile/character names `Deleted`.
   - `player_identities` / `devices` / `consents` gone for that account.
   - Platform-auth for that GC/PGS id mints a **new** user (or returns
     `account_deleted` until Auth email is rewritten away from the synthetic
     mailbox).
5. Do **not** grant clients `EXECUTE` on `delete_my_account()`.

## Carlos deploy / setup

1. **Approve** migration `0024` (product: soft-delete / anonymize; M1 revoke on
   `delete_my_account`).
2. Hosted Development (`yrrytppmkykzhwelqmcs`):
   ```bash
   pnpm exec supabase db push   # or link + migration apply
   pnpm exec supabase functions deploy account-delete
   pnpm exec supabase functions deploy platform-auth
   ```
3. Confirm Edge secrets already present (`SUPABASE_SERVICE_ROLE_KEY` via
   platform). No new third-party secrets for R5.
4. Game client env (existing): `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. **Support inbox:** set `EXPO_PUBLIC_ACCOUNT_DELETION_SUPPORT_EMAIL` on the
   public web host (Play data-deletion URL fallback).
6. **Public URL hosting:** attach custom domain to `botore-game` (SSO exempt)
   **or** host `/account/delete` on another public origin with the same
   rewrite to `index.html`. Record the canonical URL for R4 / R6 privacy
   materials.
7. Smoke:
   - In-app delete on a throwaway Development account (success notice →
     Continue → fresh silent auth)
   - Mint code → open `/account/delete` → redeem
   - No-code support form mailto
   - Confirm `player_identities` gone and platform-auth mints a new account

## Verification

```bash
pnpm db:reset
# includes supabase/tests/run.sql R5 block
deno test -A --config=supabase/functions/account-delete/deno.json \
  supabase/functions/account-delete
deno test -A --config=supabase/functions/platform-auth/deno.json \
  supabase/functions/platform-auth
pnpm --filter @botore/game test
node scripts/edge-coverage-gate.mjs
```

## Related

- Platform auth: `docs/backend/platform-auth.md`
- Client read RPCs: `docs/backend/client-read-rpcs.md`
- Ticket: [R5](https://app.clickup.com/t/1amjtreyb0h)
