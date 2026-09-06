# B/T/E admin QA — before affiliate invites

**Gate:** Anthony + Gavin sign off this checklist **before** Blair, Trin, or Emmie get portal logins or the TRUE30 PDFs go out again.

**Decision (locked):** TRUE30 PDF = **payout-only credit audit**. Those 33 orders are **not** reattributed in SliceWP and **will not appear** on B/T/E ledgers in the portal. Portal = **live going-forward** commissions only. Credit from the PDF is handled separately (CSV / your existing payout process).

You do **not** need B/T/E accounts for this. Use **Admin → Affiliate → View as affiliate** (impersonation) to see exactly what they will see.

Related: [AUTH-ONBOARDING-SPEC.md](./AUTH-ONBOARDING-SPEC.md), TRUE30 PDFs in `docs/reports/true30-export/`. Prod audit: `npx tsx scripts/audit-bte-true30-prod.ts`.

---

## Who does what

| Person | Task |
|---|---|
| **Anthony** | Admin login works; run sync if stale; fix blockers |
| **Gavin** | Portal data reviewer — live commissions, drawers, lifetime; PDF reviewed as standalone credit memo |
| **Stone** | Optional second pass |

---

## Setup (once)

- [ ] Gavin completed admin setup link → signs in at [ts-affiliates.vercel.app/login](https://ts-affiliates.vercel.app/login) → lands on `/admin`
- [ ] Open TRUE30 PDFs locally (same versions you will send):
  - `docs/reports/true30-export/blair-true30-commission-review.pdf`
  - `docs/reports/true30-export/trin-true30-commission-review.pdf`
  - `docs/reports/true30-export/emmie-true30-commission-review.pdf`
- [ ] Optional: `docs/reports/true30-export/bte-lifetime-cookie-wins.pdf` for lifetime repeat context

---

## What to QA (two separate tracks)

### Track A — TRUE30 PDF (payout credit memo)

Confirm the PDF you send is internally correct. **Do not** expect these orders in the portal under Blair / Trin / Emmie.

| Affiliate | Affected orders | Credit total (PDF) | Rate |
|---|---|---|---|
| **Blair** | 14 | **$404.04** | 30% |
| **Trin** | 7 | **$282.09** | 40% |
| **Emmie** | 12 | **$394.79** | 30% |

- [ ] PDF totals match table above
- [ ] Copy explains TRUE30 coupon override + separate credit (no customer emails in table)
- [ ] Team agrees credit is paid outside the portal (existing payout process)

**Prod fact (2026-09-06 audit):** all 33 orders are still credited to **ads ads** (TRUE30 coupon affiliate, slicewp 181) in SliceWP. That is expected under this decision.

### Track B — Portal (live commissions)

Impersonate each affiliate and review **orders they actually own** in SliceWP — link, cookie, lifetime, coupon wins on their account.

1. **Admin → Affiliates** — search **Blair** / **Trin** / **Emmie**
2. Open affiliate detail → **View as affiliate**
3. **Commissions** tab — **All time**; spot-check recent rows and Aug 21 – Sep 3 window
4. Tap rows → **commission drawer** (not the TRUE30 PDF order list)
5. **Exit impersonation** — banner → Return to admin

**Do not fail QA** because TRUE30 PDF order #s are missing from B/T/E's ledger — that is by design.

---

## Portal spot-check orders (minimum per affiliate)

Pick **live** commissions (link or lifetime), not the TRUE30 PDF list:

### Blair

| Order | What to check |
|---|---|
| Recent high-value **link** row (e.g. #11071 area) | Amount sane, journey timeline, winning rule |
| Any **lifetime** repeat if visible | Linked customer, order X of Y |

### Trin

| Order | What to check |
|---|---|
| Recent **link** row (e.g. #12119 area) | Journey + amount |
| **#12341** | Lifetime repeat ~$11, **order 2+ of N**, first link **#1573** |

### Emmie

| Order | What to check |
|---|---|
| Recent **link** row (e.g. #10965 area) | Journey + amount |
| Another mid-period row | Drawer loads, no 500 |

---

## Per-order drawer checklist (portal rows only)

| Field | Pass? | Notes |
|---|---|---|
| Commission **amount** matches what you'd expect for that order | ☐ | Compare to WP admin if unsure |
| Badge / winning rule makes sense (link vs lifetime vs coupon) | ☐ | |
| Journey timeline present (not empty) | ☐ | |
| Customer line: “Linked · order X of Y” or “New customer” (no email) | ☐ | |
| Order subtotal in drawer ≈ sensible | ☐ | Excl. shipping/tax |

---

## Broader ledger sanity (impersonation view)

| Check | Blair | Trin | Emmie |
|---|---|---|---|
| Commission count plausible vs WP | ☐ | ☐ | ☐ |
| Recent orders after Sep 3 appear (sync) | ☐ | ☐ | ☐ |
| Lifetime repeat rows show **Linked customer** not false “No click” | ☐ | ☐ | ☐ |
| Payouts tab loads without error | ☐ | ☐ | ☐ |
| Links / coupons tabs load | ☐ | ☐ | ☐ |
| TRUE30 PDF order #s **absent** from their ledger | ☐ | ☐ | ☐ | Expected — credit is PDF-only |

---

## Platform smoke (either admin)

- [ ] Login / logout
- [ ] Impersonation banner visible and exit works
- [ ] Drawer opens on mobile width (resize browser)
- [ ] No 500s on `/api/ledger`, drawer detail fetch

---

## Sync

If commissions look stale (missing orders after Sep 3):

- Admin → trigger sync (or wait for cron)
- Re-check latest order # vs WooCommerce

---

## Sign-off

| Reviewer | Date | Result |
|---|---|---|
| Anthony | | ☐ Pass / ☐ Blocked |
| Gavin | | ☐ Pass / ☐ Blocked |

**Blockers** (file GitHub issue or note here):

```
-
```

---

## After sign-off → A5 (B/T/E invites)

Only when both pass:

1. Send TRUE30 PDFs (email/DM)
2. Include the handoff note below (PDF credit ≠ portal rows)
3. Admin → each affiliate → **Reset password** (or create login) → deliver one-time link
4. 48h soak → then WP redirect planning

### Handoff note (copy/paste — adjust per person)

> Your ambassador portal is live at https://ts-affiliates.vercel.app/login (beta).
>
> **Attached PDF** — TRUE30 credit audit for orders Aug 21 – Sep 3 where your referral was on the order but commission went to the coupon instead of you. That **$[TOTAL]** credit is handled in our normal payout process, separate from the portal.
>
> **The portal** shows your **live** commissions going forward (and everything SliceWP already credits to your account). Those TRUE30 orders will **not** appear as separate rows there — the PDF is the record for that adjustment.
>
> Sign in with the link below, set your password, and spot-check a few recent commissions. Reply if anything looks off.

Replace `$[TOTAL]` with Blair $404.04 / Trin $282.09 / Emmie $394.79.

Do **not** send production invites until this doc is signed off (internal QA logins are fine).
