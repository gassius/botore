# Release readiness docs (R4)

In-repo drafts for App Store / Play listing basics **before** wide
TestFlight / Play internal testing beyond engineering builds.

| Doc                                                    | Purpose                                                             |
| ------------------------------------------------------ | ------------------------------------------------------------------- |
| [`checklist.md`](./checklist.md)                       | Pre-submit release checklist (links R2 credentials as Carlos-owned) |
| [`store-listing.md`](./store-listing.md)               | Listing copy + native screenshots pipeline                          |
| [`store-questionnaires.md`](./store-questionnaires.md) | Support, age rating, Apple privacy / Play data-safety drafts        |

**Privacy (shipped R6):** player-facing `/privacy` + engineering notes in
[`docs/legal/privacy-policy.md`](../legal/privacy-policy.md). Account
deletion (R5): [`docs/backend/account-deletion.md`](../backend/account-deletion.md).

**R2 credentials (Carlos-owned):**
[`docs/architecture/eas-production-credentials.md`](../architecture/eas-production-credentials.md)
— do not invent `projectId` or signing secrets here.

**Non-goals for these docs:** marketing site redesign; paid UA; inventing
EAS `projectId` / signing secrets (see [R2](https://app.clickup.com/t/1amjtrey7v5));
console uploads.

Ticket: [R4: Store listing metadata + privacy policy](https://app.clickup.com/t/1amjtrey7vd).
