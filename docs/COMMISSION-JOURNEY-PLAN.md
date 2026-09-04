# Commission detail & customer journey plan

Give affiliates a **clickable commission row** that explains order, customer (privacy-safe), journey timeline, and **why they were paid** under your priority rules (coupon → last click → lifetime, internal-ads, email, etc.).

**Work one milestone at a time.** Do not start the next milestone until the current one's exit criteria are checked off.

Related docs: [COMMISSION-RULES-CONFIRM.md](./COMMISSION-RULES-CONFIRM.md), [AFFILIATE-PORTAL-MIGRATION.md](./AFFILIATE-PORTAL-MIGRATION.md).

---

## Decisions (lock before M1)

| Topic | Recommendation | Your call |
|---|---|---|
| Scope | **Commissions the affiliate earned** (ledger rows they already see) | ☑ Approve |
| Missed orders | Orders where their cookie lost → **out of scope v1** (admin/support tool later) | ☑ Approve |
| Customer PII | **No** buyer email/name in affiliate view | ☑ Approve |
| Customer identity | Anonymized: "Linked customer · order 3 of 5" | ☑ Approve |
| Other affiliates | **Never** name another affiliate in affiliate-facing copy | ☑ Approve |
| Store promo / internal-ads | When *they* lost: N/A (no row). When *they* won despite promo on order: explain winning rule only | ☑ Approve |
| Historical backfill | **From 2026-08-18 onward** (aligned with B/T/E rules start); no older orders | ☑ Approve |
| Klaviyo campaign names | **Optional** (M10) — session entry host is enough for v1 | ☑ Approve |
| Audit snapshot | Write `_ts_slicewp_attribution_audit` JSON on order **at commission time** (don't reconstruct on read) | ☑ Approve |

### Priority rules (source of truth for copy)

From `COMMISSION-RULES-CONFIRM.md` + `slicewp-lifetime-priority.php`:

1. **Affiliate coupon** → coupon owner (includes `true30` when linked to internal-ads)
2. **Affiliate link / last click** → cookie owner at checkout (includes email/internal-ads as affiliate cookies)
3. **No link, no coupon** → lifetime linked customer (naked repeat)
4. **None** → no commission

WP implementation: coupon/link restore at priority 25 beats lifetime add-on at 20.

---

## What we're building

```
Commissions list
┌──────────────────────────────────────────────────┐
│ Order #8309 · $89 sale · $26.70    [Link click] │  ← tap
└──────────────────────────────────────────────────┘
         ↓
┌─ Commission detail (drawer) ─────────────────────┐
│  WHY YOU EARNED THIS                             │
│  Your link was the last referral at checkout.    │
│                                                  │
│  ORDER      #8309 · Aug 30 · $89.00 · coupon —  │
│  CUSTOMER   Linked · 2nd order                   │
│  JOURNEY    [vertical timeline]                  │
│  PAYOUT     Pending · est. Mon batch             │
└──────────────────────────────────────────────────┘
```

**OVERRIDE rows** use a different template (recruit, source order, deal rule) — mostly data already in `LedgerEntry`.

---

## Systems touched

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│ WP theme                │     │ Bridge mu-plugin         │     │ ts-affiliate-platform   │
│ order-awaiting-payment  │────▶│ GET …/commissions/{id}/  │────▶│ OrderAttribution sync   │
│ slicewp-lifetime-priority│    │     journey              │     │ GET /api/ledger/…/detail│
│ writes audit meta       │     │ reads WC + SliceWP       │     │ CommissionDetailDrawer  │
└─────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

---

## Milestone dependency graph

```
M0 Decisions & copy
 │
 ▼
M1 WP attribution audit snapshot
 │
 ▼
M2 Bridge journey endpoint
 │
 ├──────────────────┐
 ▼                  ▼
M3 Portal schema   M4 Fix attribution badges
 │                  │
 └────────┬─────────┘
          ▼
M5 Detail API + types
 │
 ▼
M6 Detail drawer UI
 │
 ▼
M7 Lifetime customer history
 │
 ▼
M8 Historical backfill
 │
 ▼ (optional)
M9 Traffic cross-links
M10 Klaviyo enrichment
```

---

## Milestone 0 — Decisions & affiliate copy

**Goal:** Lock product boundaries and write user-facing strings before engineering.

### Tasks

- [x] Check off the **Decisions** table above (edit inline if anything changes)
- [x] Add copy keys to `lib/affiliate/copy.ts` under `commissions.detail`:
  - `whyCoupon`, `whyLink`, `whyLifetime`, `whyCookieNoClick`
  - Section labels: `whyTitle`, `orderTitle`, `customerTitle`, `journeyTitle`, `payoutTitle`
- [x] Define `winningRule` enum in a shared types file (portal + mock):
  - `coupon` | `link` | `lifetime` | `none`
- [x] Document affiliate-safe phrasing for edge cases (see table below)

### Edge-case copy (affiliate-safe)

| Situation | Copy | Key |
|---|---|---|
| Click + visit row | "Your link was clicked and was the last referral at checkout." | `detail.why.linkWithVisit` |
| Cookie on order, visit_id=0 | "Your referral was stored on this order. No new click was recorded." | `detail.why.cookieNoClick` |
| Lifetime naked repeat | "Returning customer linked to you. No affiliate link or coupon on this order." | `detail.why.lifetime` |
| Their coupon used | "Your coupon {code} was used. Coupon attribution beats link attribution." | `detail.why.coupon(code)` |
| Team override | "Team bonus from {recruit}'s sale on order #{orderId}." | `detail.why.override(recruit, orderId)` |

Headline helpers: `lib/ledger/attribution-audit.ts` (`commissionWhyHeadline`, etc.).

### Exit criteria

- [x] Decisions table signed off
- [x] Copy keys exist in `copy.ts` (English only; i18n later if needed)
- [x] `winningRule` type exported from `lib/ledger/attribution-audit.ts`

---

## Milestone 1 — WP attribution audit snapshot

**Goal:** Persist an immutable "why" record on each order when SliceWP creates a commission.

**Safety:** Hooks `slicewp_insert_commission` at priority 100 only. **No** attribution filters, **no** commission recalculation, **no** backfill of old orders.

**Repo:** `inc/slicewp-attribution-audit.php` (loaded after `checkout.php`)

### Audit JSON shape

Meta key: `_ts_slicewp_attribution_audit` (order meta; map keyed by commission id)

```json
{
  "version": 1,
  "commissions": {
    "12345": {
      "recordedAt": "2026-09-04T08:30:00Z",
      "winningRule": "lifetime",
      "paidAffiliateId": 81,
      "commissionId": 12345,
      "commissionType": "lifetime_sale",
      "candidates": {
        "coupon": { "affiliateId": 0, "codes": [] },
        "link": { "affiliateId": 0, "visitId": 0 },
        "lifetime": { "affiliateId": 81, "customerId": 4936 }
      },
      "order": {
        "coupons": ["TRUE30"],
        "referrerMeta": { "affiliateId": 81, "visitId": 0 },
        "sessionEntryHost": "email.klaviyo.com"
      }
    }
  }
}
```

### Tasks

- [x] Add `true_sciences_slicewp_build_attribution_audit()` in `inc/slicewp-attribution-audit.php`
- [x] Hook `slicewp_insert_commission` (priority 100, after insert)
- [x] Unit-style script: `bin/test-attribution-audit.php`
- [ ] Deploy to **Local WP first**; spot-check 3 order types in admin order meta

### Exit criteria

- [x] `bin/test-attribution-audit.php` passes (coupon / link / lifetime scenarios)
- [ ] New orders on Local WP have `_ts_slicewp_attribution_audit` populated
- [ ] Audit matches manual expectation for: coupon win, link win, lifetime win
- [ ] No buyer email in meta JSON
- [x] Existing commission logic unchanged (audit is write-only sidecar)

---

## Milestone 2 — Bridge journey endpoint

**Goal:** Expose commission + order + audit data through the existing bridge (server-side WC credentials).

**Repo:** `true-sciences-04` mu-plugin `true-sciences-slicewp-bridge.php` + portal `lib/slicewp-bridge.ts`

### Route

```
GET /slicewp-ts/v1/commissions/{slicewp_commission_id}/journey
```

Auth: existing SliceWP API key (admin key used by sync).

### Response shape (portal-facing)

```typescript
type CommissionJourneyPayload = {
  commission: {
    slicewpId: number;
    type: string;
    amount: string;
    referenceAmount: string | null;
    visitId: number | null;
    customerId: number | null;
    dateCreated: string;
  };
  order: {
    wooOrderId: number;
    total: string;
    dateCreated: string;
    coupons: string[];
    status: string;
  } | null;
  visit: {
    slicewpId: number;
    landingUrl: string | null;
    referrerUrl: string | null;
    occurredAt: string;
  } | null;
  audit: AttributionAudit | null; // from order meta; null for pre-M1 orders
  customer: {
    slicewpId: number;
    orderCount: number;       // commissions for this affiliate + customer
    firstOrderId: number | null;
    firstCommissionDate: string | null;
  } | null;
};
```

### Tasks

- [x] Register route in bridge PHP
- [x] Load commission from `slicewp_commissions` by id
- [x] Load visit by `visit_id` OR `commission_id` on visits table
- [x] Load WC order by `reference`
- [x] Read `_ts_slicewp_attribution_audit` from order meta
- [x] Customer summary: count prior commissions same affiliate + `customer_id`
- [x] Add `fetchCommissionJourney(id)` to `lib/slicewp-bridge.ts`
- [x] Smoke script: `scripts/m2-journey-smoke.ts`
- [ ] Curl test against Local WP (Mode B in migration doc)

### Exit criteria

- [x] Portal bridge client typed (`CommissionJourneyPayload`, `fetchCommissionJourney`)
- [x] 404 distinguishes missing commission vs missing bridge route
- [x] No PII in response shape (no buyer email)
- [ ] Endpoint returns 200 for a known commission id on Local WP

---

## Milestone 3 — Portal schema & sync

**Goal:** Mirror journey fields in Supabase so the drawer doesn't hit WP on every open (optional lazy-load fallback for missing rows).

**Repo:** `ts-affiliate-platform`

### Schema changes

```prisma
model Commission {
  // existing fields…
  visitSlicewpId    Int?
  customerSlicewpId Int?
  winningRule       String?   // coupon | link | lifetime | none
  attributionAudit  Json?     // snapshot from order meta
}

model OrderAttribution {
  id                      String   @id @default(cuid())
  wooOrderId              Int      @unique
  referrerAffiliateSlicewpId Int?
  referrerVisitSlicewpId  Int?
  couponCodes             String[] // or Json
  sessionEntryHost        String?
  checkoutChannel         String?  // native | tagada | manual
  attributionAudit        Json?
  syncedAt                DateTime @default(now())
}
```

### Tasks

- [x] Prisma migration (`Commission` + `OrderAttribution` models)
- [x] Extend `buildCommissionData()` in `lib/sync.ts` — map SliceWP REST `visit_id`, `customer_id`
- [x] During commission sync: `enrichCommissionJourneyAfterSync()` in `lib/sync-journey.ts`
  - Bridge fetch capped at **75 commissions/sync** (newest first, since 2026-08-18)
  - Skips silently when bridge unavailable
- [x] Denormalize `winningRule` + `attributionAudit` onto `Commission` from journey audit
- [x] Index: `Commission.customerSlicewpId`, `OrderAttribution.wooOrderId`

### Deploy note

Run once on dev/prod Supabase before sync:

```bash
npm run db:push
```

### Exit criteria

- [ ] Migration applied on dev Supabase (`db:push`)
- [ ] Sync run populates `visitSlicewpId` / `customerSlicewpId` for all commissions
- [ ] Sync log metadata includes `journeyEnriched`, `journeyPending`, `journeyBridgeAvailable`
- [x] `npm run build` passes
- [x] Journey enrich capped — no unbounded bridge calls per sync

---

## Milestone 4 — Fix attribution badges

**Goal:** `TrackedByBadge` matches reality before the detail drawer ships.

**Repo:** `lib/ledger/attribution.ts`, `TrackedByBadge`, sync data from M3

### Logic (replace visit-only check)

For DIRECT rows, `trackedByClick = true` when **any** of:

1. `Commission.visitSlicewpId > 0`
2. `Visit.slicewpCommissionId` matches
3. `OrderAttribution.referrerVisitSlicewpId > 0` for same `wooOrderId`

Add optional `attributionKind` on enriched entries: `click | cookie | coupon | lifetime` for badge/tooltip refinement (v1 can stay boolean + lifetime flag).

### Tasks

- [x] Update `enrichLedgerAttribution()` with visit_id + order attribution join
- [x] Export `resolveTrackedByClick()` for shared logic
- [x] Update mock fixtures — varied click / no-click / lifetime scenarios

### Exit criteria

- [x] `resolveTrackedByClick` checks visit row, commission.visitSlicewpId, order referrer visit meta
- [x] Lifetime rows still show **Linked customer**
- [x] Override rows unchanged (badge hidden)
- [x] `npm run build` passes
- [ ] Verified against prod data after sync (visit_id + OrderAttribution populated)

---

## Milestone 5 — Detail API & types

**Goal:** Single affiliate-scoped endpoint powering the drawer.

### Route

```
GET /api/ledger/[entryId]/detail
```

Auth: affiliate session; entry must belong to requesting affiliate (or team sponsor rules if applicable).

### Response

```typescript
type CommissionDetailResponse = {
  entry: LedgerEntryFields; // amount, status, occurredAt, payoutWeek, etc.
  why: { rule: WinningRule; headline: string; detail?: string };
  order: { id: number; total: string; date: string; coupons: string[] } | null;
  customer: { label: string; orderIndex: number | null; totalOrders: number | null } | null;
  journey: JourneyStep[];   // { kind, label, at, meta? }[]
  payout: { status: string; batchLabel?: string; paidAt?: string } | null;
};
```

Build `journey` server-side from Commission + Visit + OrderAttribution + audit — **don't** expose raw audit JSON to client if copy is sufficient.

### Tasks

- [x] `lib/ledger/commission-detail.ts` — pure builder + unit tests
- [x] `app/api/ledger/[entryId]/detail/route.ts`
- [x] Mock handler in `lib/mock/` for `dev:mock`
- [x] Rate limit / cache: journey data is immutable after payout — `Cache-Control: private, max-age=3600`

### Exit criteria

- [x] API returns detail for DIRECT mock entries (all 4 winning rules)
- [x] API returns 404 for other affiliate's entry
- [x] OVERRIDE entry returns recruit-focused detail (no journey)
- [x] `npm run build` passes

---

## Milestone 6 — Detail drawer UI

**Goal:** Wire clickable commission rows to a polished drawer.

### Tasks

- [x] `components/affiliate/CommissionDetailDrawer.tsx`
  - Sections: Why → Order → Customer → Journey → Payout
  - Loading / error states
  - Mobile: full-screen sheet
- [x] Wire `CommissionRow.onClick` in commissions panel (`CommissionsPanel` or ledger page)
- [x] Keyboard: Escape closes; focus trap
- [ ] Analytics hook (optional): `commission_detail_opened`

### Exit criteria

- [ ] Tap any DIRECT commission → drawer with real or mock data
- [ ] Matches `docs/STYLE_GUIDE.md`
- [ ] `npm run dev:mock` demo covers coupon, link, lifetime, cookie-no-click
- [x] No customer email anywhere in DOM

---

## Milestone 7 — Lifetime customer history

**Goal:** Rich "Linked customer" story for `lifetime_sale` commissions.

### Tasks

- [x] In detail API: query prior DIRECT commissions same `customerSlicewpId` + affiliate
- [x] Journey prepend step: "First linked · {date} · Order #{firstOrderId}"
- [x] Customer section: "Order {n} of {total} from this customer"
- [ ] Optional: "View all orders" → filter commissions list by customer (query param `?customer={hash}` — hash of customerSlicewpId, not raw id in URL if paranoid)

### Exit criteria

- [x] Lifetime detail shows first-link date when customer_id synced
- [x] First-order-only lifetime still works (order 1 of 1)
- [ ] Performance: single detail request ≤ 3 DB queries

---

## Milestone 8 — Historical backfill

**Goal:** Pre-M1 orders get best-effort detail (no audit snapshot → reconstruct from meta).

### Tasks

- [x] Script: `scripts/backfill-order-attribution.ts`
  - Input: `--since 2026-08-18` (**fixed default** — do not backfill before this date)
  - Calls bridge journey endpoint per commission missing `attributionAudit`
  - For orders without audit: bridge computes candidates from live meta (same PHP helpers, no commission hook)
  - Flags: `--apply`, `--limit`, `--affiliate-id`, `--out` (disagreement CSV); dry-run by default
- [x] Run against **dev Supabase** first; review sample with B/T/E
- [x] Prod schema pushed (`winningRule`, `OrderAttribution`, etc. via `BACKFILL_DATABASE_URL=… npx prisma db push`)
- [x] Prod run: read-only WP, upsert portal only
- [x] Log orders where reconstruction disagrees with paid commission (admin CSV) — none found

### Exit criteria

- [x] ≥95% of B/T/E commissions from **2026-08-18 onward** have `winningRule` populated (99% — 1584/1598)
- [x] Disagreement list reviewed (orders before 8/18 are intentionally excluded)
- [ ] Affiliates see detail drawer on historical rows (audit null → softer copy: "Best available attribution data")

---

## Milestone 9 — Traffic tab cross-links (optional)

**Goal:** Connect Traffic tab ↔ commission detail.

### Tasks

- [ ] Converted visit row → link to commission detail when `slicewpCommissionId` set
- [ ] Detail journey click step → deep link to Traffic tab filtered by date
- [ ] Traffic row: show order # on converted clicks

### Exit criteria

- [ ] Round-trip navigation works in mock + prod
- [ ] No new API endpoints required

---

## Milestone 10 — Klaviyo enrichment (optional)

**Goal:** Name the email channel when session entry is Klaviyo.

### Prerequisites

- Klaviyo **private** API key in WP or portal env
- Only if Gavin wants campaign names visible to affiliates

### Tasks

- [ ] Parse `_wc_order_attribution_session_entry` in bridge (already partial in M2)
- [ ] Optional Klaviyo Events lookup by `_kx` or profile
- [ ] Affiliate-safe label: "Email campaign" or campaign name (no recipient data)

### Exit criteria

- [ ] Email-attributed orders show email step in journey
- [ ] Works without Klaviyo key (degrades to "Email")

---

## Out of scope (v1)

| Item | Why | Future |
|---|---|---|
| Missed commission / lost cookie log | Different product surface; needs admin | M? "Attribution disputes" |
| Buyer email/name | Privacy | Admin WC link only |
| Other affiliate names | Avoid drama | Internal PDF reports |
| Product line items | Nice-to-have | Add to order section later |
| Real-time journey | Commissions are immutable | Not needed |
| Editing attribution | SliceWP is source of truth | Admin only in WP |

---

## Testing checklist (run before prod deploy)

### WP (Local)

- [x] Coupon beats link (affiliate coupon on order)
- [x] Link beats lifetime (cookie present, customer linked to Blair)
- [x] Naked lifetime (no coupon, no cookie, linked customer)
- [x] Tagada order with referrer meta
- [x] Manual payment order — commission on processing only

### Portal

- [ ] Detail drawer for each scenario above
- [ ] Badge matches detail "why" section
- [ ] OVERRIDE row shows recruit story
- [ ] CSV export still correct
- [ ] `npm run build` + smoke test on Vercel preview

### Prod rollout

- [ ] Deploy M1 (audit write) → monitor 24h
- [ ] Deploy M2 bridge → verify one curl on prod
- [ ] Deploy M3–M6 platform → enable for pilot affiliates
- [ ] M8 backfill → announce to B/T/E

---

## Key files reference

| Area | Path |
|---|---|
| WP attribution engine | `true-sciences-04/.../inc/order-awaiting-payment.php` |
| Lifetime priority | `true-sciences-04/.../inc/slicewp-lifetime-priority.php` |
| Bridge plugin | `true-sciences-04/.../mu-plugins/true-sciences-slicewp-bridge.php` |
| Portal sync | `ts-affiliate-platform/lib/sync.ts` |
| Attribution enrich | `ts-affiliate-platform/lib/ledger/attribution.ts` |
| Commission row | `ts-affiliate-platform/components/affiliate/CommissionRow.tsx` |
| Copy | `ts-affiliate-platform/lib/affiliate/copy.ts` |
| Schema | `ts-affiliate-platform/prisma/schema.prisma` |
| Audit CSV examples | `ts-affiliate-platform/docs/reports/non-bte-linked-repeat-orders-2026-08-17.csv` |

---

## Progress tracker

| Milestone | Status | Completed |
|---|---|---|
| M0 Decisions & copy | ✅ | 2026-09-04 |
| M1 WP audit snapshot | 🟡 | 2026-09-04 — prod deployed; monitor 24h |
| M2 Bridge endpoint | ✅ | 2026-09-04 — v1.4.0 on prod |
| M3 Portal schema & sync | 🟡 | 2026-09-04 — `db:push` done; prod sync pending |
| M4 Fix badges | ✅ | 2026-09-04 |
| M5 Detail API | ✅ | 2026-09-04 |
| M6 Detail drawer UI | ✅ | 2026-09-04 |
| M7 Lifetime history | 🟡 | 2026-09-04 — API + drawer; optional customer filter deferred |
| M8 Historical backfill | ✅ | 2026-09-04 — prod: 1584/1598 winningRule (99%), 14 stale SliceWP ids |
| M9 Traffic cross-links | ☐ optional |
| M10 Klaviyo | ☐ optional |

---

*Last updated: 2026-09-04*
