# Wu Jacky Pokémon GO 賣場（開發分支）

此分支用於測試新版網站，不是正式網站。

## Branch safety
- Current development branch: `test/full-build-v1`
- Production branch: `main`
- Do not merge to `main` or publish until owner reviews and explicitly approves.
- Product entries in `index.html` are demo placeholders, not real stock or offers.

## Current status — 2026-10-19

The isolated Supabase project `wu-jacky-pokemon-staging` now has a reviewed, applied staging baseline: 13 RLS-enabled tables, admin membership checks, and atomic manual stock adjustment / purchase receipt / order completion / physical stock return functions. Rollback-only SQL acceptance tests pass. Database acceptance tests created no persistent fixtures. The owner subsequently created a real staging Auth account and its admin membership was provisioned by exact owner-provided UID. No real products or orders have been entered. Production and `main` are unchanged.

`index.html` remains a demo catalog. `admin.html` remains the original browser-local prototype. Neither silently connects to cloud data or imports local data.

`cloud-admin.html` is a separate staging admin entry point with password login, server-checked admin authorization, cloud product editing, optimistic concurrency, and stock adjustment through RPC. It builds and is deployed as a separate owner-private test site at https://wu-jacky-admin-staging.gentleray7.chatgpt.site . The owner administrator has been enrolled and the database membership check passes; real browser login and iPhone interaction still need acceptance testing.

## Build the cloud admin

Requires Node.js 22+:

```sh
npm ci --ignore-scripts --no-audit --no-fund
npm test
npm run build:admin
```

Serve the repository using an approved HTTPS preview before opening `cloud-admin.html`. The bundle at `assets/cloud-admin.bundle.js` is a generated build output, intentionally ignored by Git. A deployment must include it. CI builds it but does not publish anything.

`staging-config.mjs` contains only the staging project URL and publishable browser key; it is not a secret. Never put a service-role key, database password, Auth password or webhook in client source. Supabase sessions are kept in memory; closing/reloading the page requires login again. A pending stock operation is journaled in this tab's sessionStorage by authenticated user ID so retries after a reload reuse the original idempotency key. Closing the tab can remove that journal; unresolved operations must be checked against the ledger before any new stock action.

## Applied staging SQL vs historical drafts

Applied sources, in order:

1. `supabase/staging/reviewed-baseline.sql` — migration `20261019091155_reviewed_staging_baseline`.
2. `supabase/staging/advisor-hardening.sql` — migration `20261019091513_staging_advisor_hardening`.
3. `supabase/staging/admin-session-check.sql` — migration `20261019091654_staging_admin_session_check`.

The original draft sequence in `supabase/migrations/` has **not** been applied as standalone migrations. It is historical input, superseded for staging by the reviewed bundle. Do not run it on top of the new baseline: object definitions overlap. Analytics migrations and Edge Functions remain unapplied/disabled.

The public catalog view has no client grants. Inventory, receipts, order state/items, finance and audit records cannot be directly rewritten by authenticated clients. Privileged implementations live in `private`; public RPC facades are SECURITY INVOKER. Admin membership is never derived from editable user metadata. No public signup/admin-promotion flow is provided by the UI.

## Verification

- `npm test`: source and executable behavior tests; no live database credentials needed.
- `npm run build:admin`: bundles pinned Supabase SDK and app sources.
- `tests/staging-database-acceptance.sql`: run ONLY on isolated staging; test fixtures and synthetic Auth users are wrapped in BEGIN/ROLLBACK. It covers anonymous/non-admin denial, trusted admin operations, idempotency, invalid inputs, all-or-nothing failure, and stock-ledger reconciliation.
- Actual anonymous Data API calls were denied for products, balances, orders and the closed catalog view.
- Security advisors: no findings after hardening. Performance advisors: only INFO for new/unused indexes.

Not yet verified: real-user Auth login, iPhone layout/clipboard/session handling, true concurrent multi-connection inventory requests, forced audit-write failure, backup/restore. No claim of production readiness is made.

## Next steps

1. Owner opens the private test site and signs in with the newly created staging Auth account. The account password stays with the owner.
2. Run real-device login, product editing, stock adjustment/retry and logout acceptance tests.
3. Complete order/purchase entry and lifecycle UI, image storage policies, safe public catalog API, tags/cloud CSV, and backup/restore before production review.

## Business workflow

Inquiry is not an accepted order. The seller manually confirms availability, supplier fulfillment, final price, delivery and payment. No automatic payments, supplier purchases, or financial decisions are implemented. See `docs/DATA-CONTRACT.md` and the historical plans for the remaining requirements.
