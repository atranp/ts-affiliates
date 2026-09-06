# B/T/E admin QA — before affiliate invites

**Gate:** Anthony + Gavin sign off this checklist **before** Blair, Trin, or Emmie get portal logins or the TRUE30 PDFs go out again.

You do **not** need B/T/E accounts for this. Use **Admin → Affiliate → View as affiliate** (impersonation) to see exactly what they will see.

Related: [AUTH-ONBOARDING-SPEC.md](./AUTH-ONBOARDING-SPEC.md), TRUE30 PDFs in `docs/reports/true30-export/`.

---

## Who does what

| Person | Task |
|---|---|
| **Anthony** | Admin login works; run sync if stale; fix blockers |
| **Gavin** | Primary data reviewer — PDF vs portal line-by-line |
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

## How to review an affiliate (repeat ×3)

1. **Admin → Affiliates** — search **Blair** / **Trin** / **Emmie**
2. Open affiliate detail
3. Click **View as affiliate** (orange banner = impersonating)
4. **Commissions** tab — period **All time** or filter Aug 21 – Sep 3, 2026 if available
5. For each PDF order row: find order # → tap row → **commission drawer**
6. **Exit impersonation** — banner → Return to admin

---

## TRUE30 PDF anchor totals (must match your review)

These are the numbers in the PDFs you’re sending. Portal should show the **same orders** with **matching commission amounts** (drawer subtotal may differ from order total — commission base is excl. shipping/tax).

| Affiliate | Affected orders | Credit total | Rate |
|---|---|---|---|
| **Blair** | 14 | **$404.04** | 30% |
| **Trin** | 7 | **$282.09** | 40% |
| **Emmie** | 12 | **$394.79** | 30% |

---

## Spot-check orders (minimum per affiliate)

Check **every** PDF order if time allows; at minimum these:

### Blair (14 orders · $404.04)

| Order | PDF commission | Check in drawer |
|---|---|---|
| #10855 | $42.51 | Link click / coupon story |
| #10950 | $26.99 | Same visit |
| #12005 | $62.99 | Returned later |
| #12164 | $23.76 | Returned later |

### Trin (7 orders · $282.09)

| Order | PDF commission | Check in drawer |
|---|---|---|
| #11106 | $96.47 | Same visit |
| #11090 | $17.79 | Returned later + click appendix |
| #12067 | $44.11 | Returned later |

### Emmie (12 orders · $394.79)

| Order | PDF commission | Check in drawer |
|---|---|---|
| #10901 | $85.03 | Returned later (largest) |
| #11084 | $48.08 | Returned later |
| #12173 | $41.07 | Returned later |
| #12258 | $13.34 | Returned later (smallest) |

---

## Per-order drawer checklist

For each spot-check order:

| Field | Pass? | Notes |
|---|---|---|
| Order # matches PDF | ☐ | |
| Commission **amount** matches PDF “Your commission” | ☐ | |
| Badge / winning rule makes sense (link vs lifetime vs coupon) | ☐ | TRUE30 rows may show **coupon** won historically — PDF explains credit |
| Journey timeline present (not empty) | ☐ | |
| Customer line: “Linked · order X of Y” or “New customer” (no email) | ☐ | |
| Order subtotal in drawer ≈ sensible vs PDF order total | ☐ | Subtotal excludes shipping/tax |

---

## Broader ledger sanity (impersonation view)

| Check | Blair | Trin | Emmie |
|---|---|---|---|
| Commission count plausible vs WP | ☐ | ☐ | ☐ |
| Recent orders after Sep 3 appear (sync) | ☐ | ☐ | ☐ |
| Lifetime repeat rows show **Linked customer** not false “No click” | ☐ | ☐ | ☐ |
| Payouts tab loads without error | ☐ | ☐ | ☐ |
| Links / coupons tabs load | ☐ | ☐ | ☐ |

### Trin lifetime example (from prior audit)

- Order **#12341** — lifetime repeat, ~$11 commission on ~$110 subtotal — drawer should say **order 2+ of N**, first link order **#1573**

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

1. Send TRUE30 PDFs (email/DM — already updated copy, no customer emails in table)
2. Admin → each affiliate → **Create login** → deliver one-time link
3. Short note: portal shows live commissions; PDF is the TRUE30 credit audit
4. 48h soak → then WP redirect planning

Do **not** create B/T/E portal logins until this doc is signed off.
