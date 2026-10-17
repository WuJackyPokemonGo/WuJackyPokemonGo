# Wu Jacky Pokémon GO 賣場（開發分支）

此分支用於測試新版網站，不是正式網站。

## Branch safety
- Current development branch: `test/full-build-v1`
- Production branch: `main`
- Do not merge to `main` or publish until owner reviews and explicitly approves.
- Product entries in `index.html` are demo placeholders, not real stock or offers.

## Current prototype
- Responsive mobile-first catalog layout
- Search by Chinese/English name, aliases, and displayed Pokédex number
- Multi-tag intersection filters and price sorting
- Product details, sold-out and low-stock labels
- Local inquiry list with quantity changes and copyable inquiry text
- No checkout, payment processing, inventory reservation, customer account, or backend integration

## Admin prototype
`admin.html` is a local-browser-only prototype for product CRUD, tags, stock movements, and CSV exchange. It has no authentication or cloud sync; do not use it for real customer or accounting data. See `docs/TEST-AND-RELEASE-PLAN.md` and `docs/DATA-CONTRACT.md` before any backend integration.

## Database schema draft
`supabase/migrations/202610170001_initial_schema_draft.sql` is a **draft only**. It has not been applied to any Supabase project. It deliberately enables RLS and adds no public read/write policies. The frontend must not be connected to these tables until the following are designed, reviewed, and tested:
1. Trusted admin authorization and least-privilege RLS policies.
2. A public catalog view/API that excludes exact stock, supplier details, costs, customer data, and finance.
3. Transaction-safe inventory movement and order-state functions with audit logging.
4. Storage policies for product images and a tested backup/restore procedure.
5. A separate staging project and test data.

## Next implementation gates
1. Confirm the intended Supabase project/account and free-tier limits before creating resources.
2. Complete security review of schema, RLS, storage, and server-side operations.
3. Build admin CRUD screens only after safe backend authorization is available.
4. Test search/cart/inquiry behavior on real mobile browsers.
5. Review the complete diff and get explicit owner approval before production deployment.

## Business workflow
Inquiry is not an accepted order. The seller must manually confirm availability, supplier fulfillment, final price, delivery, and payment before treating an order as confirmed. No automatic payments or automatic supplier orders are implemented.
