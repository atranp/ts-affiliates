# Affiliate Portal Migration Plan (Path A)

Replace the SliceWP affiliate-facing UI with [ts-affiliate-platform](https://ts-affiliates.vercel.app) while **keeping SliceWP + WooCommerce as the commission engine** on WordPress.

**Strategy:** Mirror SliceWP over REST → extend with a small WP bridge mu-plugin → admin/affiliate UI in Next.js → cutover with Supabase provisioning on registration.

**Work one milestone at a time.** Do not start the next milestone until the current one's exit criteria are checked off.

---

## Decisions (locked in)

| Topic | Decision |
|---|---|
| Architecture | **Path A** — SliceWP stays system of record; platform is mirror + payout/decision layer |
| Identity after cutover | Registration stays on WP; `slicewp_register_affiliate` provisions Supabase user + set-password email |
| Direct payouts | Recorded in platform; write-back to SliceWP via bridge |
| Dev WordPress | Local by Flywheel (`true-sciences-04.local`) |
| Dev platform DB | Prod Supabase through M2. **A dev Supabase project is required from M3 on** — see [Dev modes](#dev-modes) |
| Lifetime commissions | Enable **after** portal cutover (Milestone 7); hide `lifetime_sale` in affiliate UI |

---

## Three systems (don't confuse them)

```
┌─────────────────────────┐     ┌──────────────────────────┐     ┌─────────────────────────┐
│ Local WP                │     │ ts-affiliate-platform    │     │ Live WP + SliceWP       │
│ true-sciences-04.local  │     │ npm run dev / Vercel     │     │ true-sciences.com       │
│ DB: local (MySQL)       │     │ DB: Supabase             │     │ DB: production          │
│ Own SliceWP data        │     │ Mirror + ledger          │     │ Source of truth           │
└─────────────────────────┘     └──────────────────────────┘     └─────────────────────────┘
```

| Action | Affects live SliceWP? | Affects prod Supabase? |
|---|---|---|
| Edit Local WP admin | **No** | No |
| Platform sync (prod URL → prod DB) | Read only | **Yes** (upserts) |
| Platform sync (local URL → prod DB) | No | **Blocked** by guard |
| Platform sync (local URL → dev DB) | No | No — dev Supabase only |
| Platform ledger/payout edits | No | **Yes** |
| Future WP writes (M2+) | **Yes** if URL is prod | No |
| Vercel cron sync | Read only | Yes |

---

## Dev modes

Three configurations — flip in `.env.local`:

### Mode A — Platform work (ledger, payouts, admin UI on real data)

```bash
# USE_ENV_CREDENTIALS="true"   ← comment out or remove
WC_STORE_URL="https://true-sciences.com"
# ... prod WC + SliceWP keys (or rely on Supabase Settings row)
```

Sync: prod SliceWP → prod Supabase ✓

### Mode B — Local WP experiments (bridge plugin, write-back testing)

```bash
USE_ENV_CREDENTIALS="true"
WC_STORE_URL="http://true-sciences-04.local"
# ... Local WP API keys (NOT prod keys)
```

Sync: **blocked** (local → prod Supabase). Use direct API calls / Test SliceWP instead.

**Never** save Local credentials in Admin → Integrations while on prod Supabase — that overwrites the row Vercel uses.

### Mode C — Local WP + local Supabase ✅ (required from M3)

Same `.env.local` as Mode B, but the Supabase block points at a **local stack** rather than a second hosted project. Sync: local SliceWP → local Supabase ✓ (guard passes; neither side is production).

M3 and M4 cannot be verified without this. Their exit criteria depend on a full sync against Local WP, which `assertSyncTargetsAgree` blocks while the database is production. M0–M2 did not need it: the bridge is curl-testable and M2 writes were verified in Local WP admin.

```bash
supabase start          # Studio on :55323, db on :55322, mail on :55324
npm run bootstrap-admin # mint an admin login — prod admins live in prod Supabase
npm run sync:local
npm run cohort rules    # overrides need mirrored affiliate rows, so sync first
```

Ports are 553xx rather than the 543xx default because the `danno-app` project already owns that range. Switching back to Mode A means moving the comment markers between the two Supabase blocks in `.env.local`; nothing else changes.

#### `WC_STORE_URL` must be `https://` on Local

WooCommerce refuses consumer key/secret **query-string auth over plain HTTP** and answers `401 woocommerce_rest_cannot_view`. SliceWP accepts either, so the store looks healthy while only the WooCommerce half is broken.

That is not a cosmetic failure. The customer lookup is what resolves affiliate names, and an affiliate whose SliceWP record has no usable email is skipped outright. Over HTTP the first Mode C sync silently mirrored **82 of 92 affiliates and 961 of 1123 commissions**, with every `displayName` blank. Over HTTPS: 92, 1123, and all names resolved.

Local signs each site with its own self-signed certificate and Node does not read the macOS keychain, so it has to be trusted explicitly:

```
NODE_EXTRA_CA_CERTS="$HOME/Library/Application Support/Local/run/router/nginx/certs/true-sciences-04.local.crt"
```

The `dev:local`, `sync:local`, `cohort`, and `bootstrap-admin` npm scripts set this from `config.localCert` in `package.json`. That value is stored **relative to `$HOME`** because the shell expands `$HOME` and `$npm_package_config_localCert` in the same pass — a `$HOME` inside the config value reaches Node unexpanded and Node quietly ignores the cert.

#### `dev-sync.ts` must drive the lock lifecycle

`runFullSync()` calls `setSyncStep()`, which **updates** the `Settings` singleton. `tryBeginSync()` is what creates that row. The API route calls both; calling `runFullSync()` bare therefore works forever against production, where the row already exists, and fails on the first sync into any fresh database. `scripts/dev-sync.ts` now mirrors the route: `clearStaleSyncLock()` → `tryBeginSync()` → `runFullSyncJob()`.

### Gotcha: `NODE_ENV` disables the override

`isEnvCredentialsOverride()` requires `NODE_ENV !== "production"`, and `next build && next start` sets it to production. A local production build therefore **ignores `USE_ENV_CREDENTIALS` and reads the Supabase Settings row** — pointing at the live store. Use `npm run dev` for all Mode B/C work.

---

## Safety rails (implemented)

| Guard | File | What it does |
|---|---|---|
| Sync clobber fix | `lib/sync-write.ts` | Settled ledger entries (`payoutBatchId` set) keep `PAID` status during sync |
| Production write block | `lib/env-guard.ts` | Refuses WP mutations when store URL is `true-sciences.com` unless `ALLOW_PRODUCTION_WRITES=true` |
| Local→prod sync block | `lib/env-guard.ts` | Refuses sync when store is non-prod but Supabase is prod |
| Local→prod mirror skip | `lib/env-guard.ts` | `shouldMirrorWrites()` — a write to a non-prod store is not mirrored into a prod database |
| Guard regression check | `scripts/dev-guard-check.ts` | `npm run guard-check` — evaluates all four guards against synthetic store/database pairs; 6/6 passing |
| Production auth block | `lib/env-guard.ts` | `assertWritableAuth()` — refuses Supabase Auth mutations (invite, password reset, disable, force sign-out) unless running on Vercel |
| Local mail trap | `mu-plugins/true-sciences-local-mail-guard.php` | Forces all Local WordPress mail to Mailpit; without it WP Mail SMTP sends via Resend to real inboxes |
| Env credential override | `lib/settings.ts` | `USE_ENV_CREDENTIALS=true` (dev only) reads `.env.local` instead of Supabase Settings |
| Settings save block | `app/api/settings/route.ts` | 409 when env override active — can't clobber prod config |

Vercel production only: set `ALLOW_PRODUCTION_WRITES=true` after Milestone 6 cutover.

### Local WordPress sends real email — audited 2026-08-23

Local carries a clone of the production database, so every affiliate and customer row holds a real address. Mailpit does **not** protect this by itself: `wp-mail-smtp` is active and configured for `smtp.resend.com` as `contact@true-sciences.com`, which overrides PHP's `sendmail_path` and bypasses the catcher entirely.

Verified by booting WordPress and inspecting PHPMailer after `phpmailer_init`, without sending:

```
Mailer: smtp   Host: smtp.resend.com   Port: 465   SMTPAuth: true
VERDICT: MAIL LEAVES THE MACHINE
```

`true-sciences-local-mail-guard.php` now rewrites the WP Mail SMTP options and PHPMailer config to Mailpit on any host that is not `true-sciences.com`. It parses the Mailpit address out of `sendmail_path`, so it survives Local reassigning the port. Re-verified after install: config resolves to `127.0.0.1:10011`, and a real `wp_mail()` landed in Mailpit rather than Resend.

Limits worth knowing:

- Covers everything routed through `wp_mail()`. Does **not** cover senders that call an HTTP API directly — **Klaviyo** and **MailPoet**'s sending service are both active and bypass PHPMailer.
- If Mailpit is not running, SMTP connect fails and `wp_mail()` returns false. Fail-safe: a lost dev email, never a delivered one.
- Deleting the file restores normal sending. It is inert on production.

### Test cohort — development never touches a real affiliate (2026-08-23)

Local WordPress is a restore of production, so every affiliate on it is a real person's record. Nothing there propagates to the live site, but developing against those rows means the difference between a safe and an unsafe command is a single ID — and it makes local results hard to trust.

`scripts/test-cohort.ts` seeds a self-contained cohort instead:

| Affiliate | `payment_email` | Sponsor | Seeded commissions |
|---|---|---|---|
| Quinn Sponsor | `ts-qa-sponsor@example.com` | — | 2 unpaid · $75.00 |
| Robin Recruit | `ts-qa-recruit-1@example.com` | Quinn | 3 unpaid · $112.50 |
| Sam Recruit | `ts-qa-recruit-2@example.com` | Quinn | 2 unpaid · $51.00 |

A sponsor with two recruits is the smallest tree that exercises direct payouts, override payouts, and the MLM parent chain at once. Commissions carry `reference_amount`, so `orderRevenue` is populated and rate maths are checkable.

```
npm run cohort seed | rules | list | teardown
```

`rules` is the one command that touches the platform database rather than SliceWP. It gives the sponsor a 10% `COMMISSION_OVERRIDE` on each recruit, which is what makes override payouts testable — so it needs Mode C, and it has to run *after* a sync, since the rules attach to mirrored affiliate rows.

Resulting unpaid ledger, and the reason this cohort is the M3 test case:

| Affiliate | Type | Entries | Total | Settleable in SliceWP |
|---|---|---|---|---|
| Quinn Sponsor | `DIRECT` | 2 | $75.00 | 2 |
| Quinn Sponsor | `OVERRIDE` | 5 | $16.35 | **0** |
| Robin Recruit | `DIRECT` | 3 | $112.50 | 3 |
| Sam Recruit | `DIRECT` | 2 | $51.00 | 2 |

Paying Quinn is a $91.35 batch against which SliceWP can only be told about $75.00 — the exact mismatch M3's reconciliation has to expect rather than report.

Design points worth keeping:

- **`example.com` is RFC 2606 reserved** and can never receive mail, so a misrouted notification has nowhere to land even if the mail guard failed.
- **Commissions use `origin: "ts-qa"`**, never `woo`, so seeded rows can never be mistaken for real orders.
- **Identity is the payment email, not an ID allowlist.** Teardown and reseed shift the IDs every time (the first cohort was 101–103, the second 104–106); an ID list would silently start pointing at whoever inherited the number.
- **`assertTestAffiliate()` in `scripts/cohort.ts`** is called by every mutating script before it writes. Verified: pointing the M2 smoke test at real affiliate #17 now aborts with the affiliate's email in the message instead of editing it.
- **Teardown leaves the WordPress user accounts behind.** They are inert once the affiliate row is gone. Reseeds therefore suffix `user_login` / `user_email` with a generation stamp while `payment_email` stays stable.

Verified across a full seed → teardown → reseed cycle: real affiliates stayed at exactly 89 and real commissions at exactly 1116, teardown returned both to baseline with no residue, and Mailpit stayed at 2 messages — creating three WordPress users sent nothing.

One real row on Local was modified before this existed: the M2 smoke test defaulted to affiliate #17. It restored status and payment email, never touched the rate meta, and the admin audit log shows no UI edits. Local-only regardless — production was never in the path.

### Why M2's REST writes were safe anyway

SliceWP hangs the affiliate approved/rejected notifications off `slicewp_update_affiliate`, but both bail before sending on a REST request:

| Notification | Guard that stops it |
|---|---|
| `affiliate_account_approved` | `is_admin()` is false for REST, and `$_POST['send_email_notification']` is empty |
| `affiliate_account_rejected` | `$_POST['send_email_notification']` and `$_POST['affiliate_reject_reason']` are both empty |

A REST call sends a JSON body, so `$_POST` is never populated. **The M2 write path structurally cannot fire these.** The same is not true of Local's wp-admin, which does set those fields — hence the mail guard.

### The platform never sends email

Audited: no `inviteUserByEmail`, `resetPasswordForEmail`, `generateLink`, or any transactional email provider in the codebase. Portal invites use `createUser` with `email_confirm: true` and hand the temporary password back for the admin to relay manually.

The real exposure was different — those actions mutate **live Supabase Auth accounts** (create, reset password, ban, revoke sessions) and `.env.local` points at production Supabase. `assertWritableAuth()` now blocks all five when not running on Vercel. It keys on `VERCEL === "1"` rather than `NODE_ENV`, because `next build && next start` sets `NODE_ENV=production` locally.

### Known gap: `ENCRYPTION_SECRET` is the example placeholder

`.env.local` currently holds the literal value shipped in `.env.example`:

```
ENCRYPTION_SECRET="generate-a-long-random-secret-here"
```

This is the key that encrypts the WooCommerce and SliceWP credentials in the `Settings` table. Two problems:

1. **If production uses a different secret**, local reads of the Settings row throw rather than degrade — `decryptOptional` calls `decrypt` directly and AES-GCM raises on an auth-tag mismatch.
2. **If production uses this same placeholder**, the credentials are decryptable by anyone with the repo and read access to the database.

`getKey()` also falls back to `SUPABASE_SERVICE_ROLE_KEY` when `ENCRYPTION_SECRET` is unset — so if production never set it, rotating the service role key silently makes every stored credential undecryptable.

Fix before M6, when a **read/write** SliceWP key goes into that same column. See M0 tasks.

**Resolved 2026-08-23:** Rotated on Vercel (Production + Preview), synced to `.env.local`, prod credentials re-saved via Admin → Integrations. `decryptOptional` now returns `null` on bad decrypt (`lib/encryption.ts`).

---

## Milestone dependency graph

```
M0 ✅ ──► M1 ✅ ──► M2 ✅ ──► M3 ✅ ──► M4 ✅ ──► M5 ✅ ──► M6 ──► M7 (optional)
                             ▲
                             └── dev Supabase (Mode C) required from here on
```

## Testing posture

The repo has no automated tests. That was tolerable for a read-only mirror; it stops being tolerable at M3, where a bad request marks commissions paid on a live store.

Not proposing a full suite. The minimum is anything where "submit twice" or "partial failure" is the hazard and eyeballing won't catch it:

- Settle idempotency (M3) — ✅ `npm run m3-smoke`
- Direct payout anchor dedupe (M3) — ✅ `npm run m3-smoke`
- `syncDirectLedgerEntries` not walking a settled entry back to `UNPAID` (already fixed) — ✅ `npm run m3-smoke` now runs a full sync mid-test and asserts the batch survives it

Everything else stays manual via the exit criteria.

These are scripts against a live Local WP + local Supabase, not unit tests. That is deliberate: the hazards here are all in the seam between two systems, and a mocked SliceWP would test the mock. The cost is that they need the cohort seeded first.

---

## Milestone 0 — Safety rails & local wiring ✅

**Goal:** Impossible to accidentally hurt prod while developing.

**Status:** Complete (2026-08-23). Ready for M1.

### Tasks

- [x] Sync clobber guard (`lib/sync-write.ts`)
- [x] Environment guards (`lib/env-guard.ts`)
- [x] `USE_ENV_CREDENTIALS` dev override (`lib/settings.ts`; exported as `isEnvCredentialsOverride()`)
- [x] Integrations UI banner + save block when env override active
- [x] **Rotate `ENCRYPTION_SECRET`**
  - [x] Checked Vercel production (had placeholder-era value; rotated)
  - [x] Generated secret, set on Vercel Production + Preview, deployed
  - [x] Prod WC + SliceWP credentials re-saved via Admin → Integrations
  - [x] Same value in `.env.local`
  - [x] `decryptOptional` returns `null` on failure (`lib/encryption.ts`)
- [x] Point `.env.local` at Local WP (Mode B) with **Local** API keys
- [x] Confirm Local WP REST: SliceWP affiliates endpoint returns 200
- [x] Confirm Mode A sync allowed (prod store → prod Supabase; guard passes)
- [x] Confirm Mode B sync blocked (local store → prod Supabase; guard throws)
- [x] Fix Local active theme if needed — **N/A** (site loads; active theme `true-sciences-v3-31`)
- [x] Provision SliceWP API key on Local WP (Read/Write, administrator)
- [ ] **Optional follow-up:** Local WooCommerce REST key returns 401 — regenerate in Local WP (`WooCommerce → Advanced → REST API`, Read/Write, **Administrator** user). Sync still runs; affiliate name enrichment from WC is skipped until fixed.

### Exit criteria

- [x] Admin → Integrations shows correct store URL for active mode (prod: `true-sciences.com`; local: `true-sciences-04.local` + `.env.local` banner)
- [x] Test SliceWP succeeds (prod re-saved; local verified via API)
- [x] `ENCRYPTION_SECRET` is a generated value in Vercel + `.env.local`; prod Integrations loads
- [x] No `ALLOW_PRODUCTION_WRITES` locally

### M0 verification log (2026-08-23)

Automated checks run with `.env.local` loaded (`USE_ENV_CREDENTIALS=true`):

| Check | Result |
|---|---|
| `isEnvCredentialsOverride()` active | pass |
| Resolved store URL | `http://true-sciences-04.local` |
| Local SliceWP connection | pass |
| Mode B sync guard (`local → prod DB`) | blocked ✓ |
| Mode A sync guard (`prod → prod DB`) | allowed ✓ |
| Prod write guard (no override) | blocked ✓ |
| Local site HTTP | 200 |
| Local WC customer API | 401 — optional fix (see above) |

Vercel project linked: `cognify-523d7fab/ts-affiliates`.

### Touches live?

No.

---

## Milestone 1 — WordPress bridge mu-plugin ✅

**Goal:** Fill REST gaps on **Local WP only**.

**Status:** Complete (2026-08-23). Ready for M2.

**File:** `app/public/wp-content/mu-plugins/true-sciences-slicewp-bridge.php` (true-sciences-04 repo)  
**Namespace:** `slicewp-ts/v1`

Filename follows the existing `true-sciences-*.php` convention in that directory rather than the `ts-` prefix originally sketched here.

### Auth — inherited, not reimplemented

`SliceWP_API_Auth::is_request_to_our_api()` matches any REST route whose namespace begins with `slicewp/` **or** `slicewp-`. Because the bridge uses `slicewp-ts/v1`, the add-on's `determine_current_user` filter authenticates these routes with the same `consumer_key`/`consumer_secret` pair as the native ones — no separate secret, no second auth path to keep in sync.

Each route then runs the same `current_user_can( 'manage_options' )` check the native controllers use. Reads need a Read key; `/payments/settle` needs Read/Write. The key must belong to an administrator.

### Endpoints

| Method | Route | Purpose |
|---|---|---|
| `GET` | `/creatives` | Active marketing assets |
| `GET` | `/affiliates/{id}/coupons` | `slicewp_get_affiliate_coupons()` |
| `GET` | `/affiliates/{id}/store-credit` | Store credit balance |
| `GET` | `/affiliate-fields` | Registration/settings field schema |
| `GET` | `/affiliate-extras` | Bulk slug + referral URL + store credit + coupons (M4) |
| `GET` | `/affiliates/{id}/link` | Referral link for an arbitrary landing page (M5) |
| `POST` | `/affiliates/{id}/settings` | Validated self-service settings write (M5) |
| `POST` | `/payments/settle` | Create payment **with** `commission_ids` + mark commissions paid (atomic) |

Native SliceWP `POST /payments/` omits `commission_ids` from its schema — the settle endpoint is required for payout write-back.

### Settle endpoint contract (implemented)

Retry-after-timeout is the expected failure mode in M3 — the platform commits locally, then the WP call times out and must be safely repeated. So:

- Platform sends `idempotency_key` = the `PayoutBatch.id`. Stored in payment meta as `_ts_settle_idempotency_key`.
- A repeat call with the same key **returns the existing payment (200)** with `"replayed": true`, rather than creating a second one or erroring. `409` would force the caller to distinguish "already done" from "genuinely conflicting", which is the bug-prone path.
- Independently, refuse the whole request (`409`) if any supplied commission already carries a `payment_id`. That's a real conflict.
- Payment insert + commission updates run inside a `START TRANSACTION` / `COMMIT`. **Confirmed all `zww_slicewp_*` tables are InnoDB**, so the rollback is real rather than silently ignored.
- All validation (affiliate exists, every commission exists, belongs to that affiliate, is unsettled) happens **before** the transaction opens, so the common rejections never write at all.

`commission_ids` is a real column on `slicewp_payments` — SliceWP's own payout flow writes it as a comma-separated string. The native REST schema simply omits it, which is the gap this endpoint closes.

Request body:

```json
{
  "affiliate_id": 51,
  "commission_ids": [879, 881, 885],
  "idempotency_key": "batch-uuid",
  "amount": "56.00",
  "status": "paid",
  "payout_method": "manual",
  "currency": "USD"
}
```

`amount` defaults to the sum of the supplied commissions, `payout_method` to the affiliate's configured method, `currency` to the SliceWP active currency, `status` to `paid`.

### Tasks

- [x] Create mu-plugin scaffold + permission check (reuses SliceWP API key auth)
- [x] Implement read endpoints
- [x] Implement `POST /payments/settle` per the contract above
- [x] Document curl examples in mu-plugin header comment
- [x] Manual test all endpoints against Local WP

### Exit criteria

- [x] All endpoints return valid JSON with Local read_write key
- [x] Settle endpoint creates payment and flips commissions to `paid` in one request
- [x] Same `idempotency_key` twice → one payment, second call returns it
- [x] Commission already attached to a payment → `409`, nothing mutated

### M1 verification log (2026-08-23)

Run against Local WP with a Read/Write admin key. Test data reverted afterwards, so Local is unchanged.

| Case | Expected | Result |
|---|---|---|
| `GET /creatives` | 200 | `[]` (none defined on Local) |
| `GET /affiliate-fields` | 200 | Custom field schema returned |
| `GET /affiliates/100/coupons` | 200 | `{"affiliate_id":100,"coupons":[]}` |
| `GET /affiliates/100/store-credit` | 200 | `{"balance":0,"currency":"USD"}` |
| No credentials | 401 | `rest_forbidden` |
| Invalid credentials | 401 | `rest_forbidden` |
| Settle 3 commissions | 200 | Payment created, `amount` 56.00 = sum of the three |
| Same `idempotency_key` again | 200 | Same payment id, `replayed: true`, no second payment |
| Same commissions, new key | 409 | `commission_already_settled` |
| Commission from another affiliate | 409 | `commission_affiliate_mismatch` |
| Nonexistent commission in batch | 404 | Valid commission in the same batch left untouched |
| Missing `idempotency_key` | 400 | `rest_missing_callback_param` |

Post-run database check: commissions correctly `paid` with `payment_id` set, `commission_ids` column populated, idempotency meta written, and **zero orphan meta rows** from the rejected requests.

### Touches live?

No — Local only until Milestone 6 deploy.

---

## Milestone 2 — Platform write client + admin mutations ✅

**Goal:** Admin changes affiliate state in platform UI → persists to SliceWP (Local during dev).

### Tasks

- [x] `lib/slicewp-write.ts` — POST/PUT client; every call uses `assertWritableStore()`
- [x] `lib/slicewp-bridge.ts` — client for bridge read endpoints
- [x] `PATCH /api/admin/affiliates/[id]` → `PUT /slicewp/v1/affiliates/{slicewpId}`
  - `status` (approve / reject / deactivate)
  - `payment_email`
  - `parent_id` (MLM re-parent)
  - `meta_data` (commission rate override, custom slug)
- [x] Admin UI on `/admin/affiliates/[id]` — `AffiliateSliceWPPanel` in the left sidebar
- [x] `/admin/audit-log` — read-only viewer for `AdminAuditLog` + nav entry

### The mirror-write hazard M2 uncovered

The plan assumed M2 needed no dev Supabase. It nearly did.

An admin edit is two writes: one to SliceWP, one to the local `Affiliate` row so the UI is not stale until the next sync. In **Mode B** the first goes to Local WordPress and the second goes to **production Supabase** — stamping a local edit onto a row that correctly describes the live store. Sync would not repair it, because a prod sync reads prod SliceWP and would find nothing wrong.

Fix: `shouldMirrorWrites(storeUrl)` in `lib/env-guard.ts`. It returns false when the store is non-production but the database is, and `applyAffiliateEdit` skips the mirror in that case. The SliceWP write still happens; the response carries `mirrored: false` and the UI toast says the displayed values are unchanged.

This keeps M2 verifiable without Mode C. From M3 it stops being sufficient — payout write-back has to create local `PayoutBatch` rows, which cannot be skipped.

### `enable_commission_rates` gates the rate

`commission_rate_sale` alone does nothing. SliceWP Pro checks `enable_commission_rates` first (`slicewp-pro/includes/base/affiliates/functions.php:30`) and ignores the rate when it is empty. `commissionRateMeta()` in `lib/admin/affiliate-write.ts` always writes the flag alongside the rate, and clears the flag to remove an override.

Confirmed meta keys in use on Local: `enable_commission_rates`, `commission_rate_sale`, `commission_rate_type_sale`, `custom_slug`, `payout_method`, `promotional_methods`, `commission_fixed_amount_rate_basis`.

### Exit criteria

- [x] Status change on Local WP from the platform (`inactive` written and reverted; verified over REST and in `zww_slicewp_affiliates`)
- [x] `payment_email` and commission rate meta written to Local WP (`commission_rate_sale` 40 → 12.5, restored)
- [x] Every write logged in audit log with before/after, store URL, and `mirrored` flag
- [x] Write to prod URL throws guard error locally (both apex and `www`)
- [x] `npx tsc --noEmit` and `npm run build` clean

### M2 verification log (2026-08-23)

`npx tsx scripts/m2-write-smoke.ts 17` (Mode B, affiliate 17):

| Check | Result |
|---|---|
| Resolved store | `http://true-sciences-04.local` |
| `isProductionStore` | false |
| `assertWritableStore` | allowed |
| `shouldMirrorWrites` | **false** — mirror skipped (prod DB, local store) |
| Status write `active` → `inactive` | pass |
| `payment_email` write | pass |
| Both restored after test | pass |
| Rate meta `commission_rate_sale` 40 → 12.5 | pass (restored via SQL) |

Guard matrix (`lib/env-guard.ts`):

| Store | `assertWritableStore` | `shouldMirrorWrites` (prod DB) |
|---|---|---|
| `true-sciences.com` | blocked | true |
| `www.true-sciences.com` | blocked | true |
| `true-sciences-04.local` | allowed | false |

`npx tsx scripts/m2-bridge-smoke.ts 17`: bridge reachable, 5 affiliate fields, 0 creatives, 0 coupons, store credit `{balance: 0, currency: USD}`.

UI (mock-admin mode): `SliceWP record` card renders with status badge, payment email, rate, sponsor, SliceWP ID, and Edit / Reject / Deactivate. Inline edit form shows three fields with no sidebar overflow. `/admin/audit-log` renders with filters and empty state. No console or hydration errors.

Helper scripts left in `scripts/` for re-runs. The write smoke deliberately does **not** touch rate meta — the REST affiliate response does not echo it back, so the script cannot restore what it overwrites.

### Touches live?

No — Local WP only.

---

## Milestone 3 — Payout write-back + reconciliation ✅

**Goal:** Recording a payout in the platform settles commissions in SliceWP. Direct payouts fully in platform.

**Prerequisite: dev Supabase (Mode C).** ✅ Done — see the Mode C section. The exit criteria below require a full sync from Local WP, which is blocked while the database is production.

### Only DIRECT entries can be written back (discovery, 2026-08-23)

`OVERRIDE` ledger entries are produced by `lib/rules-engine.ts` from platform `DealRule` rows. They carry a `dealRuleId` and a `sourceCommissionId` pointing at the **recruit's** commission, but no `slicewpCommissionId` of their own — SliceWP has no matching commission, because the sponsor's cut is a platform-native concept that SliceWP never computed.

Consequences for the settle wiring:

- Send only the `slicewpCommissionId` values of `DIRECT` entries as `commission_ids`. Overrides have nothing to send.
- A batch's SliceWP payment amount will therefore be **less than** the batch total whenever overrides are included. That is correct, not a bug, but reconciliation has to compare against the direct-only subtotal or it will report a permanent false discrepancy.
- A batch made up purely of overrides has nothing to settle in SliceWP at all. It must complete locally and skip write-back rather than post an empty payment.

### The batch commits before SliceWP is told

The settle call is HTTP, so it cannot live inside the payout's database transaction, and unwinding a committed payout because a remote call timed out is worse than the two systems being briefly out of step. So `createPayout` commits, then settles, and `PayoutBatch.writeBackStatus` is the record of the gap:

| Status | Meaning |
|---|---|
| `NOT_REQUIRED` | Nothing to settle — an override-only batch, or a batch predating write-back. The default, so existing rows do not read as a backlog. |
| `PENDING` | Committed locally, not yet accepted by SliceWP. |
| `SETTLED` | `slicewpPaymentId` and `settledAmount` populated. |
| `FAILED` | `writeBackError` explains why. Always retryable. |

`settledAmount` is stored separately from the batch total because they legitimately differ whenever overrides are in the batch — reconciliation must compare against it, not the total.

Retry is safe at two independent levels: `settlePayoutBatch()` short-circuits on an already-`SETTLED` batch, and the bridge itself replays, returning the original payment with `replayed: true` when it sees a key it has already used. Verified both ways.

#### Verified end-to-end — `npm run m3-smoke`, 16/16

Against the test cohort on Local WP:

- Robin's $112.50 direct payout produced SliceWP payment #33, with all three commissions flipped to `paid` and carrying `payment_id 33`. `commission_ids` on the payment row and `_ts_settle_idempotency_key` = the batch id, both confirmed in MySQL.
- Re-settling returned the same payment and created nothing. A raw settle with the same key replayed. Exactly one payment row existed afterwards.
- Quinn's $11.25 override on that receipt paid locally and settled `NOT_REQUIRED`, as designed.
- **Failure path**, simulated as real mirror drift — a commission settled in SliceWP that the mirror still believed outstanding: the batch went `FAILED` with `commission_already_settled`, the two ledger entries stayed `PAID` locally, and a retry stayed `FAILED` with `writeBackAttempts` at 2. The payout is never silently lost or silently double-paid.
- A **full sync between settle and the later assertions** now runs inside the test, so the round trip is covered in both directions: the payment mirrors home, the commissions come back `paid`, and the batch's ledger entries survive as `PAID` rather than being reverted by the sync.

#### Teardown has to clear the mirror too

Sync never deletes affiliates it stops seeing. Tearing the cohort down in SliceWP alone left the mirrored rows behind, so a reseed landed on new SliceWP ids and the stale rows kept their ledger and deal rules — and `cohort rules` then matched the *stale* sponsor and generated nothing for the live cohort, silently. `teardown` now removes the mirrored affiliates (cascading ledger, commissions, rules, teams) and their payout batches, which are referenced by a plain column and so do not cascade.

### Duplicate payout anchors ✅

`listDirectPayoutAnchorsForMember` (`lib/payouts/direct-payout-ref.ts`) unions two sources: mirrored `SlicewpPayment` rows and `PayoutBatch` rows containing `DIRECT` entries for that member. Once direct payouts write back, a single settlement produces **both** — a platform batch and a SliceWP payment that mirrors home on the next sync.

Effect on the member payout wizard: two near-identical options for the same recruit, same amount, same date.

This was never a double-pay. `getPayoutOptions` only reads `UNPAID` entries, so after the sponsor's override is paid against one anchor the other finds zero rows and is skipped at `options.ts:157`. But it looked broken, and an admin couldn't tell which to pick.

**Fixed with the explicit link rather than the overlap heuristic originally planned.** `PayoutBatch.slicewpPaymentId` now records exactly which payment a batch produced, so the duplicate can be identified with certainty instead of inferred. Mirrored payments claimed by a batch are dropped; the platform batch survives, because it is the record the payout UI created and it carries item-level amounts the mirrored payment does not.

Set-equality is kept as a backstop for the two cases the link cannot describe: a batch settled before the column existed, and a payment an admin recorded by hand over the same commissions. Deliberately **exact** equality, not overlap — a partial overlap means two genuinely different receipts, and collapsing those would hide a real payment and block paying the non-overlapping part.

Verified in `m3-smoke`: after the settle mirrors home, the recruit has exactly one anchor. The check is meaningful because the preceding assertion proves the mirrored `SlicewpPayment` row does exist.

### Reconciliation ✅

`lib/payouts/reconcile.ts` reports two distinct disagreements, kept separate because they call for different responses:

| | Meaning | Action |
| --- | --- | --- |
| **Outstanding** (`FAILED` + `PENDING`) | Paid here, SliceWP has not accepted it | Retry — safe, idempotent |
| **Drift** | Batch believed `SETTLED`, but the mirrored commission still is not `PAID` | Retry will not help; inspect the payment in SliceWP |

Drift only counts batches settled **before** the last commission sync. Without that gate the banner accuses itself after every payout, since a settlement that has not been read back yet is simply unsynced, not drifted. A `NULL` `lastCommissionSyncAt` yields zero — never synced means no evidence either way.

`npm run drift-probe` proves the detector is not vacuously passing: it un-pays one mirrored commission behind a settled batch, confirms the count moves 0 → 1, and restores it.

Surfaced as a banner on `/admin/payouts` with a per-batch **Retry**. No confirmation step, because the batch id is the settle idempotency key — a retry either completes a settlement that never landed or replays the one that did. Retries are written to the audit log as `payout.write_back_retry`. A retry that fails again returns 409 with the reason rather than a 500, since that is a valid outcome the admin needs to read.

The banner has a mock fixture (`ADMIN_MOCK_DATA=true`), because the healthy state is an empty banner and there would otherwise be no way to look at it without a real payout failing.

### Tasks

- [x] Seed a test cohort so payout runs never touch a real affiliate (`scripts/test-cohort.ts`)
- [x] Stand up Mode C — local Supabase, schema pushed, admin bootstrapped, full sync green, cohort override rules applied
- [x] `PayoutBatch` settlement columns — `writeBackStatus`, `slicewpPaymentId`, `settledAmount`, `settledAt`, `writeBackError`, `writeBackAttempts`, `writeBackAttemptedAt`
- [x] Extend `lib/payouts/create.ts` — after local batch commits, call `POST /slicewp-ts/v1/payments/settle` with `idempotency_key` = batch id
- [x] Pass `Commission.slicewpId` values as `commission_ids` — `DIRECT` entries only (see above); skip write-back entirely for override-only batches
- [x] Failure handling: batch goes `FAILED` if the settle fails after local commit; retry is safe via the idempotency key
- [x] **Automated test** for settle idempotency — `npm run m3-smoke`, 16 checks
- [x] Dedupe direct payout anchors (see above)
- [x] Reconciliation query: settled ledger entries where mirrored commission still `!= PAID`
- [x] Surface reconciliation count + a retry action for `FAILED` batches in the admin UI

### Exit criteria

- [x] E2E on Local: record payout → commissions `paid` in Local SliceWP → sync confirms
- [x] Payment receipt has correct `commission_ids`
- [x] Simulated write-back failure visible in admin without corrupting ledger; retry succeeds
- [x] Member payout wizard shows **one** anchor per settlement
- [x] Reconciliation returns 0 after successful payout

### Touches live?

No — Local only.

### Commands

```bash
npm run cohort teardown && npm run cohort seed   # reset the test affiliates
npm run sync:local && npm run cohort rules       # mirror them, then attach override rules
npm run m3-smoke                                 # 16 checks, destructive by design
npm run drift-probe                              # prove the drift detector fires
npm run guard-check                              # prove the prod guards hold
```

---

## Milestone 4 — Read parity (sync extensions) ✅

**Goal:** Platform DB mirrors everything affiliates see in WP portal.

### Prisma additions

| Model / column | Source |
|---|---|
| `Visit` | `GET /slicewp/v1/visits` |
| `Creative` | `GET /slicewp-ts/v1/creatives` |
| `AffiliateCoupon` | `GET /slicewp-ts/v1/affiliate-extras` |
| `Affiliate.customSlug` | `GET /slicewp-ts/v1/affiliate-extras` |
| `Affiliate.referralUrl` | `GET /slicewp-ts/v1/affiliate-extras` |
| `Affiliate.storeCreditBalance` | `GET /slicewp-ts/v1/affiliate-extras` |
| `Settings.lastVisitSyncedThrough` | visit sync watermark |

**Prerequisite: dev Supabase (Mode C)**, same as M3.

### Tasks

- [x] Prisma schema + `npm run db:push`
- [x] Extend `lib/sync.ts` with visits / creatives / coupons steps
- [x] Admin affiliate detail shows visit count + coupons (read-only)

### Exit criteria

- [x] Full sync populates new tables from Local WP (Mode C)
- [x] No new write paths introduced

### Touches live?

No — Mode C reads Local WP only.

---

### M4 verification log (2026-08-24)

#### The four things that were not what the plan assumed

**1. `referralUrl` is not in SliceWP's REST payload.** The plan expected a
`default_referral_url` field on the affiliate row. It does not exist. Neither do
the custom slug, the store credit balance, or coupons — all four are separate
per-affiliate lookups inside WordPress.

Rebuilding the URL here was rejected: its format depends on SliceWP settings
(affiliate keyword, pretty-URL mode, slug vs. id) that this app has no say over,
so a copy would drift silently the first time someone changed one. Instead the
bridge gained **`GET /affiliate-extras`**, which returns all four for every
affiliate in one request and lets WordPress build the URL itself. Without it the
sync would be four round trips per affiliate.

**2. The local `slicewp_settings` option was corrupt.** This surfaced as referral
URLs coming back as `/?=120` instead of `/aff/PGFit/`. The cause was upstream of
this project: the production-to-local clone did a naive search-replace inside a
PHP-serialized blob, leaving every string's byte-length prefix wrong, so
`unserialize()` failed and `slicewp_get_setting()` silently returned defaults for
all 53 settings.

Repaired with `scripts/fix-local-slicewp-settings.py`, which recomputes the
length prefixes. Worth knowing this failure mode exists: it degrades quietly, and
any future clone of production to local will reintroduce it.

**3. Visits are 30× everything else.** 32,879 rows against 1,123 commissions, and
only 2.3% ever converted. Two consequences: they are paged 1,000 at a time rather
than 100 (329 round trips would have been the dominant cost of a sync), and
`ip_address` is deliberately not mirrored — it is PII, the affiliate portal never
shows it, and nothing here needs it.

**4. `date_min` is reliable for visits.** The codebase carries a "SliceWP date
filters are unreliable" warning, which is true of commissions. It was checked
rather than assumed here: every filter's count matched MySQL exactly, and
`date_min` is inclusive (`>=`). Incremental sync depends on this, so the check is
recorded rather than left as folklore.

#### Why the visit sync makes two passes

A date watermark alone is wrong, and the failure is silent.

Visits are append-only *until one converts* — at which point SliceWP writes
`commission_id` onto the **original** row and leaves `date_created` untouched. That
row is already behind the watermark, so a date-bounded fetch will never look at it
again, and the conversion never arrives. Revenue attribution would quietly
under-report forever.

So `syncVisits()` fetches new rows by `date_min` **and** re-fetches
`converted=true` unbounded. The second set stays small because it tracks the
commission count, not the visit count. `scripts/m4-verify.ts --drill` proves this
by back-filling a commission onto a visit six weeks behind the watermark and
confirming it lands.

The watermark is SliceWP's own newest `date_created`, not the wall clock, so a run
that dies midway cannot advance past rows it never wrote.

#### Isolation of the parity steps

Visits, creatives and coupons run through `syncParitySafely()`, which logs a
failure per step and continues. None of it affects what anyone is owed, so a store
without the bridge plugin — or one step failing — should not cost the sync its
money data. This mirrors the existing treatment of `/payments/`.

#### Results — Local WP, local Supabase

| | |
|---|---|
| Initial backfill | 32,879 visits, 3 creatives, 18 coupons, 25 slugs — 17.5s total sync |
| Second run | 743 visits (742 converted + 1 at the inclusive boundary) — 8.2s |
| `npm run m4-verify` | 11/11 |
| `npm run m4-verify -- --drill` | 13/13 |
| `npm run m3-smoke` (regression) | 16/16 |
| `npm run guard-check` (regression) | 6/6 |

`m4-verify` compares the mirror against SliceWP's own MySQL tables rather than
against itself. Counts alone would not catch a timezone bug or a mis-joined
affiliate, so it also checks per-affiliate totals for the five busiest affiliates
and both ends of the date range.

That date check earned its place: SliceWP stores GMT with no timezone marker, so
`new Date(...)` reads it as local and shifts every row by the UTC offset — enough
to skip a window of visits on every sync. `parseGmt()` appends the `Z`.

#### No new write paths

`/affiliate-extras` is registered `READABLE`. `lib/sync-parity.ts` contains no
mutating calls. The only `CREATABLE` bridge route and the only POST in
`lib/slicewp-bridge.ts` are still M3's `/payments/settle`, behind
`assertWritableStore`.

#### Admin UI

`AffiliateReachPanel` on the affiliate detail page: referral link with copy,
custom slug, clicks / last-30-days / converted with conversion rate, last click,
store credit, and coupons with use counts. Read-only — every value is owned by
SliceWP and configured in WordPress. Verified in `ADMIN_MOCK_DATA` mode against
both a populated affiliate and one with no slug and no coupons.

#### Commands

```bash
npm run m4-probe            # inspect SliceWP payload shapes and volume
npm run m4-verify           # compare the mirror against SliceWP's MySQL tables
npm run m4-verify -- --drill  # also prove late conversions are picked up
```

---

## Milestone 5 — Affiliate portal parity (UI) ✅

**Goal:** Affiliates can do everything in the platform they currently do in WP (except registration).

### New / extended tabs (`/dashboard`)

| Tab | `?tab=` | Replaces WP tab | Backing route |
|---|---|---|---|
| **Your Link** | `links` | `affiliate_links` | `GET/POST /api/links` |
| **Creatives** | `creatives` | `creatives` | `GET /api/creatives` |
| **Coupons** | `coupons` | `coupons` | `GET /api/coupons` |
| **Traffic** | `visits` | `visits` | `GET /api/visits` |
| **Settings** | `settings` | `settings` | `GET/PATCH /api/account/settings` |

Nav is grouped **Promote / Earnings / Account** — nine flat items was too many to
scan. `SidebarShell` gained an optional `group` per item to render the headings.

### Explicitly out of scope

- Registration (stays `/ambassadors/` on WP)
- Store credit checkout redemption
- Self-service password reset (admin resets via portal panel)
- MLM invite link — SliceWP has no such concept; recruitment is admin-assigned
  `parent_id`, so there is nothing to surface

### Exit criteria

- [x] Side-by-side: Local WP portal vs platform portal shows equivalent data
- [x] Settings edits persist to Local SliceWP
- [x] Existing Ledger / Teams / Payouts tabs still work

### Touches live?

No.

---

### M5 verification log (2026-08-24)

#### The custom slug could have been corrupted through the REST API

SliceWP validates custom slugs in a **form hook**, not in the model. `PUT
/slicewp/v1/affiliates/{id}` skips all of it. Writing settings through the
native REST API would therefore have let an affiliate take a slug that is
numeric (ambiguous with the id form of the link), contains spaces, or — the one
that actually costs money — **already belongs to someone else**. Slug lookups
resolve a single row, so a duplicate silently redirects another affiliate's
clicks and commissions.

So settings do not go through the native API. The bridge gained **`POST
/affiliates/{id}/settings`**, which re-implements SliceWP's three checks
server-side before saving. `npm run m5-bridge-smoke` asserts each rejection.

#### Referral links are generated by WordPress, not concatenated here

Same reasoning as M4's `referral_url`: link shape depends on store settings this
app does not own. **`GET /affiliates/{id}/link`** wraps `slicewp_get_affiliate_url()`
and takes an optional landing URL, so the deep-link generator produces exactly
what the WP portal's would. It refuses off-site URLs — a referral link to
someone else's domain tracks nothing and only looks like it works.

#### `website` was being written to the wrong place

Caught by the verification pass, not by the smoke test — and worth recording
because the smoke test *could not* have caught it.

`website` looks like affiliate meta. It is not: it is a **column on
`slicewp_affiliates`**, and it is in SliceWP's own REST schema. The bridge was
initially written as `slicewp_update_affiliate_meta(..., 'website', ...)`, which
succeeded, and read back the same value it had just written — so a write-then-read
test passed cleanly while the value was invisible to SliceWP's admin, the WP
portal, and every other consumer. An affiliate updating their website in the new
portal would have seen it "save", and nobody else would ever have seen it change.

It surfaced only because the mirror was checked against the *population*: 0 of 92
affiliates had a website, which is implausible. The real column had 31.

Two consequences:

- The bridge now writes `slicewp_update_affiliate($id, ['website' => ...])`.
- `website` is mirrored by the **main affiliate sync** from SliceWP's own
  payload, not via `/affiliate-extras`. The bridge never needed to carry it.

The lesson generalises: a round-trip test through one code path proves
serialisation, not that the value landed where the rest of the system reads it.
`m5-verify` now asserts against SliceWP's own affiliate payload instead.

#### Prisma additions

| Column | Source |
|---|---|
| `Affiliate.website` | `GET /slicewp/v1/affiliates` (main sync) |

#### Data layer

`lib/affiliate/reach.ts` — every read takes an affiliate id supplied by the
**session**, never the request body, so a caller cannot aim one at another
affiliate. The 30-day trend is grouped in SQL rather than in memory; the busiest
local affiliate has 13,309 visits and the chart needs 30 numbers.

`lib/affiliate/settings-write.ts` — deliberately narrower than the admin write
path: an affiliate may change how they are paid and how they are linked to,
never their status, rate, or sponsor. Goes to SliceWP first and mirrors only on
acceptance, and honours `shouldMirrorWrites()` like M2.

#### Results — Local WP, local Supabase

| | |
|---|---|
| `npm run m5-bridge-smoke` | 10/10 |
| `npm run m5-verify` | 17/17 |
| `npm run m4-verify` (regression) | 11/11 |
| `npm run guard-check` (regression) | 6/6 |
| UI, `AFFILIATE_MOCK_DATA` | 5 tabs, no console errors, nav highlighting correct |
| Full sync after schema change | 92 affiliates, 31 websites mirrored, 10.7s |

`m5-verify` re-runs its read assertions against the **busiest real affiliate**
after the cohort ones, because a freshly seeded cohort affiliate has no visits
and no coupons — every paging and trend assertion would otherwise pass on empty
sets and prove nothing.

#### Commands

```bash
npm run m5-bridge-smoke   # the two new bridge routes and their validation
npm run m5-verify         # the portal data layer, then the same reads on real traffic
npm run dev:mock          # the five tabs on fixtures, no auth
```

#### Known cosmetic issue

SliceWP stores websites HTML-entity-encoded (`&#038;` for `&`), an artifact of
`esc_url()` on save. Harmless in a form input, which is the only place it is
shown. It would need decoding before being rendered as an anchor.

---

## Milestone 6 — Cutover

**Goal:** Affiliates use the platform; WP affiliate area redirects.

### Tasks

- [ ] Deploy `ts-slicewp-bridge.php` to prod `mu-plugins/`
- [ ] Create prod `read_write` SliceWP API key (admin-owned) → Vercel env / prod Settings
- [ ] Set `ALLOW_PRODUCTION_WRITES=true` on Vercel production only
- [ ] Supabase provisioning hook on `slicewp_register_affiliate`
- [ ] Redirect `/affiliate-account/` → platform dashboard
- [ ] Pilot cohort (3–5 affiliates with `Profile` rows) before full redirect
- [ ] Remove theme SliceWP UI overrides (keep commission logic — see below)

### Exit criteria

- [ ] Pilot affiliates use platform exclusively
- [ ] New registration auto-provisions portal login
- [ ] Admin payout on prod write-backs to prod SliceWP
- [ ] 48h pilot with no missing-data support tickets

### Rollback

Reverse order of deploy. Each step is independently reversible; know which one you need before you start.

| Symptom | Undo | Effect |
|---|---|---|
| Affiliates confused / data wrong in portal | Remove the `/affiliate-account/` redirect | Back to WP portal instantly; platform stays readable |
| Payout write-back misbehaving on prod | Unset `ALLOW_PRODUCTION_WRITES` on Vercel | All WP mutations throw; platform reverts to read-only mirror. Payouts recorded in-platform only, settle SliceWP manually |
| Bridge endpoint erroring / fataling | Delete `ts-slicewp-bridge.php` from prod `mu-plugins/` | Native SliceWP REST unaffected; bridge-backed reads (creatives, coupons, store credit) go empty |
| Registration provisioning failing | Disable the `slicewp_register_affiliate` hook | Registration still works on WP; new affiliates get no portal login until re-enabled |

Do **not** roll back by restoring a WP database snapshot — commissions accrue continuously and a snapshot loses them.

Keep the theme's SliceWP UI overrides in place (last task) until the pilot has run its 48h. Removing them and the redirect at once means a rollback lands affiliates on a half-styled WP portal.

### Touches live?

**Yes** — first milestone that does. Deploy in order: mu-plugin → API key → Vercel env → provisioning hook → redirect → pilot.

---

## Milestone 7 — Lifetime commissions (optional, post-cutover)

**Goal:** Enable lifetime commissions without affiliates noticing.

### Tasks

- [ ] Enable add-on on prod (pilot cohort via per-affiliate meta first, not sitewide)
- [ ] Set `commission_rate_lifetime_sale` = 20% (match sale rate)
- [ ] Platform: display `lifetime_sale` as `"Sale"` in affiliate UI
- [ ] Tagada gate: priority-25 filter re-blocks lifetime override on unpaid manual orders
- [ ] Roll out sitewide after pilot validates Tagada + self-referral paths

### Exit criteria

- [ ] Repeat purchase generates `lifetime_sale` in SliceWP
- [ ] Affiliate sees normal sale line in platform ledger
- [ ] No premature commissions on unpaid Tagada orders

---

## Stays on WordPress forever

Do **not** migrate these — they run at commission-creation time:

| Component | Location (true-sciences-04) |
|---|---|
| Self-referral fraud scoring | `themes/.../inc/slicewp-self-referral.php` |
| Tagada offline commission pipeline | `themes/.../inc/order-awaiting-payment.php` |
| Per-affiliate cookie duration | `themes/.../inc/slicewp.php` |
| New-customer-only bypass list | `themes/.../inc/slicewp.php` |
| Click tracking / visit recording | SliceWP core JS on storefront |
| Registration + MLM parent assignment | `/ambassadors/` + SliceWP hooks |

---

## SliceWP REST coverage reference

| Data | Native REST | Bridge |
|---|---|---|
| Affiliates + meta | `GET/PUT /affiliates/{id}?meta=true` | — |
| Commissions | `GET/PUT /commissions/{id}` | — |
| Visits | `GET /visits` ✅ (`date_min`, `converted`, `affiliate_id` all verified) | — |
| Payments | `GET /payments/` | `POST /payments/settle` (with commission_ids) ✅ |
| Referral URL | **not exposed** | `GET /affiliate-extras` ✅ |
| Custom slug | **not exposed** | `GET /affiliate-extras` ✅ |
| Creatives | — | `GET /creatives` ✅ |
| Coupons | — | `GET /affiliates/{id}/coupons`, bulk via `/affiliate-extras` ✅ |
| Store credit | — | `GET /affiliates/{id}/store-credit`, bulk via `/affiliate-extras` ✅ |
| Field schema | — | `GET /affiliate-fields` |
| Website | `GET /affiliates` ✅ (a column, **not** meta) | — |
| Deep referral link | **not exposed** | `GET /affiliates/{id}/link` ✅ |
| Affiliate self-service settings | `PUT /affiliates/{id}` — **unsafe, skips slug validation** | `POST /affiliates/{id}/settings` ✅ |

All native writes require a **Read/Write** API key owned by a WordPress **administrator** (`manage_options`).

---

## Progress log

| Date | Milestone | Notes |
|---|---|---|
| 2026-08-23 | M0 partial | Sync clobber guard, env-guard, USE_ENV_CREDENTIALS, Integrations UI |
| 2026-08-23 | Plan review | Added: ENCRYPTION_SECRET rotation (M0), Mode C dev Supabase gate (M3+), settle idempotency contract (M1), anchor dedupe (M3), M6 rollback, testing posture |
| 2026-08-23 | **M0 complete** | ENCRYPTION_SECRET rotated + prod re-save; Vercel linked; Mode B wired; guards verified; Local SliceWP OK; Local WC key 401 (optional fix) |
| 2026-08-23 | **M1 complete** | `true-sciences-slicewp-bridge.php` on Local WP: 4 read endpoints + transactional `/payments/settle`. Auth inherited via `slicewp-` namespace prefix. 12/12 test cases pass; test data reverted |
| 2026-08-23 | **M2 complete** | `slicewp-write.ts` + `slicewp-bridge.ts` clients, `PATCH /api/admin/affiliates/[id]`, `AffiliateSliceWPPanel`, `/admin/audit-log`. Found and fixed the local→prod mirror hazard (`shouldMirrorWrites`). Writes verified against Local WP and reverted |
| 2026-08-23 | **Mail + auth audit** | Found Local WP sending via Resend to real addresses despite Mailpit. Added `true-sciences-local-mail-guard.php` (verified end-to-end) and `assertWritableAuth()` for Supabase Auth mutations. Confirmed M2's REST writes never could have emailed anyone |
| 2026-08-23 | **Test cohort** | `scripts/test-cohort.ts` + `assertTestAffiliate()`. Development no longer runs on real affiliate records; the M2 smoke script had been defaulting to a real one. Seed → teardown → reseed leaves the real 89/1116 untouched and sends no mail |
| 2026-08-23 | **Mode C live** | Local Supabase stack, schema pushed, admin bootstrapped, full sync green, cohort override rules applied. Fixed two latent bugs: `dev-sync.ts` skipped the lock lifecycle that creates the `Settings` row, and `WC_STORE_URL` over HTTP was silently dropping 10 affiliates / 162 commissions. `npm run guard-check` added, 6/6 |
| 2026-08-24 | **M3 write-back** | `PayoutBatch` settlement columns, `settlePayment()` bridge client, `lib/payouts/settle.ts`, wired into `createPayout`. `npm run m3-smoke` covers the happy path, idempotency at both levels, override-only batches, and a rejected settle — 11/11. Teardown now clears the mirror, which was silently orphaning deal rules |
| 2026-08-24 | **M3 complete** | Anchor dedupe via the explicit `slicewpPaymentId` link (exact, not the planned overlap heuristic), with exact set-equality as a backstop. `lib/payouts/reconcile.ts` separates outstanding write-backs from drift, gated on the last commission sync so it cannot accuse itself. Admin banner + per-batch retry on `/admin/payouts`, audited as `payout.write_back_retry`. `m3-smoke` 16/16 and now syncs mid-test, which also proves a sync does not un-pay a settled batch. `npm run drift-probe` confirms the drift query actually fires |
| 2026-08-24 | **M4 complete** | `Visit` / `Creative` / `AffiliateCoupon` + slug, referral URL and store credit on `Affiliate`. None of those four are in SliceWP's REST payload, so the bridge gained a bulk `GET /affiliate-extras` and lets WordPress build the referral URL rather than reproducing settings-dependent logic here. Visit sync is incremental by date watermark **plus** an unbounded `converted=true` pass, because SliceWP back-fills `commission_id` onto old rows a date filter would never revisit. 32,879 visits backfilled, second run 743. `npm run m4-verify` compares the mirror against SliceWP's MySQL directly — 13/13 with the conversion drill. Found and repaired a corrupt `slicewp_settings` option left by the prod→local clone. M3 16/16 and guards 6/6 still green |
| 2026-08-24 | **M5 complete** | Five affiliate tabs — Your Link, Creatives, Coupons, Traffic, Settings — behind `lib/affiliate/reach.ts`, all session-scoped. Settings writes do **not** use the native REST API: SliceWP validates custom slugs in a form hook, so `PUT /affiliates/{id}` would let an affiliate take a slug already belonging to someone else and silently steal their clicks. The bridge gained a validating `POST /affiliates/{id}/settings` and a `GET /affiliates/{id}/link` generator. Caught a bug in that same bridge code: `website` is a **column**, not meta, so the original meta write round-tripped perfectly while being invisible to SliceWP's own admin — found by noticing 0 of 92 affiliates had one when the real column had 31. It is now mirrored by the main sync. `m5-bridge-smoke` 10/10, `m5-verify` 17/17, M4 11/11 and guards 6/6 still green |
| | | **Next:** M6 — cutover |

_Update this table as milestones complete._

---

## Related repos / URLs

| Resource | Path / URL |
|---|---|
| Platform app | `/Users/anthonytran/Desktop/ts-affiliate-platform` |
| Local WordPress | `/Users/anthonytran/Local Sites/true-sciences-04` |
| Production store | https://true-sciences.com |
| Platform (Vercel) | https://ts-affiliates.vercel.app |
| Local WP | http://true-sciences-04.local |
