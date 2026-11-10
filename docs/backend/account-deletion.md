# Account deletion (R5)

Players can delete their Botore account **in-app** (authenticated) and via a
**public web URL** that redeems a one-time deletion code.

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

Ledgers and historical battle rows remain as anonymous tombstones.

## Schema / RPCs

Migration `0024_account_deletion.sql`:

| Callable                                  | Role            | Purpose                                                |
| ----------------------------------------- | --------------- | ------------------------------------------------------ |
| `mint_my_deletion_code()`                 | `authenticated` | One-time web code (plaintext once); stores sha256 hash |
| `delete_my_account()`                     | `authenticated` | Soft-delete for `auth.uid()`                           |
| `admin_delete_account(uuid)`              | `service_role`  | Edge JWT path                                          |
| `admin_delete_account_by_code_hash(text)` | `service_role`  | Edge web path                                          |

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

### Public web (deletion code)

```http
POST /functions/v1/account-delete
apikey: <anon>
Authorization: Bearer <anon>
Content-Type: application/json

{ "confirm": true, "deletionCode": "<32 hex, dashes optional>" }
```

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

Client helpers: `apps/game/src/garage/auth/accountDeleteClient.ts`.

## Carlos deploy / setup

1. **Approve** migration `0024` (product: soft-delete / anonymize).
2. Hosted Development (`yrrytppmkykzhwelqmcs`):
   ```bash
   pnpm exec supabase db push   # or link + migration apply
   pnpm exec supabase functions deploy account-delete
   ```
3. Confirm Edge secrets already present (`SUPABASE_SERVICE_ROLE_KEY` via
   platform). No new third-party secrets for R5.
4. Game client env (existing): `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY`.
5. **Public URL hosting:** attach custom domain to `botore-game` (SSO exempt)
   **or** host `/account/delete` on another public origin with the same
   rewrite to `index.html`. Record the canonical URL for R4 / R6 privacy
   materials.
6. Smoke:
   - In-app delete on a throwaway Development account
   - Mint code → open `/account/delete` → redeem
   - Confirm `player_identities` gone and platform-auth mints a new account

## Verification

```bash
pnpm db:reset
# includes supabase/tests/run.sql R5 block
deno test -A --config=supabase/functions/account-delete/deno.json \
  supabase/functions/account-delete
pnpm --filter @botore/game test
node scripts/edge-coverage-gate.mjs
```

## Related

- Platform auth: `docs/backend/platform-auth.md`
- Client read RPCs: `docs/backend/client-read-rpcs.md`
- Ticket: [R5](https://app.clickup.com/t/1amjtreyb0h)
