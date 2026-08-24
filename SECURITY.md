# Security Policy

## Reporting

Email the repository owner (see git log / CODEOWNERS when configured).
Do not open public issues for exploitable findings. Expect acknowledgement
within 7 days; we are a small team.

## Scope

In scope: this monorepo's code, local development stack configuration,
CI pipelines. Out of scope until public launch: production infrastructure
(none exists yet).

## Ground rules implemented by this codebase

- Server-authoritative gameplay: clients cannot submit winners, damage, XP,
  rewards, or inventory mutations (RLS deny-by-default + API-only writes).
- Seeds come exclusively from the server CSPRNG.
- Idempotency keys + unique constraints prevent double rewards.
- Ledgers are append-only (DB rules), balances reconstructable.
- Secrets live in environment variables, never in bundles or Git.
  `.env.example` documents required variables with placeholders only.
- Runtime validation on every API/analytics boundary (TypeBox).
- CI runs secret scanning and dependency license inventory.

## Developer requirements

- Never commit real credentials; never disable RLS to make tests pass.
- Report anything that weakens the guarantees above immediately.
