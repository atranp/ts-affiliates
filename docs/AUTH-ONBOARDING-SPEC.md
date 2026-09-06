# Auth, invites & onboarding spec

Ship a **polished, mobile-ready** affiliate sign-in experience for the B/T/E pilot and the broader M6 cutover. The credential model is already built (one-time links, no platform email); this doc covers **UI polish, ops runbook, QA, and rollout**.

**Work one milestone at a time.** Do not start the next milestone until the current one's exit criteria are checked off.

Related docs: [AFFILIATE-PORTAL-MIGRATION.md](./AFFILIATE-PORTAL-MIGRATION.md) (M6 cutover, portal access hand-off), [COMMISSION-JOURNEY-PLAN.md](./COMMISSION-JOURNEY-PLAN.md) (commission drawer — spot-check during pilot).

---

## Decisions (lock before A0)

| Topic | Recommendation | Your call |
|---|---|---|
| Email delivery | **No** — platform never sends mail; admin copies link + message manually | ☐ Approve |
| Self-service reset | **No** — admin issues recovery link via "Reset password" | ☐ Approve |
| Invite link type | Supabase `generateLink` → `/auth/confirm?token_hash=…` (not `action_link`) | ☐ Approve |
| First visit after link | **Must** set password before using dashboard | ☐ Approve |
| Onboarding chrome | **Minimal shell** during `mustChangePassword` (no full nav) | ☐ Approve |
| Password rules | 12+ chars, NIST-style screening (no email substring, common patterns) | ☐ Approve |
| Link TTL copy | `PORTAL_LINK_TTL_HOURS` (default 24) — must match Supabase OTP expiry | ☐ Approve |
| Pilot cohort | Blair, Trin, Emmie first; then 48 recently-earning affiliates | ☐ Approve |
| Prod invite generation | **Vercel prod admin only** — local blocked by `assertWritableAuth()` | ☐ Approve |
| WP redirect timing | After 48h pilot with zero auth/support tickets | ☐ Approve |

---

## Current state (2026-09-06)

| Area | Status |
|---|---|
| One-time invite / recovery links | ✅ Shipped (`lib/admin/affiliate-portal.ts`) |
| `/auth/confirm` redemption | ✅ Shipped |
| Login + change-password pages | ✅ Shipped, responsive baseline |
| `npm run portal-link-smoke` | ✅ 13 checks (local Supabase) |
| `NEXT_PUBLIC_APP_URL` on Vercel | ✅ Set (verify before each invite batch) |
| Onboarding minimal shell | ❌ Change-password still inside full `AffiliateShell` |
| Admin mobile credentials dialog | ⚠️ Untested on real devices |
| Supabase leaked-password protection | ❌ Dashboard toggle still off |
| B/T/E portal logins | ❌ ~2/215 affiliates have `Profile` rows |
| WP `/affiliate-account/` redirect | ❌ Not deployed |

---

## User journeys

### Journey 1 — New affiliate (admin invite)

```
Admin                          Affiliate
  |                                |
  |-- Create login (prod admin) -->|
  |-- Copy invite message -------->|  (text / DM / email — manual)
  |                                |
  |                                |-- Tap one-time link
  |                                |-- /auth/confirm (server verifyOtp)
  |                                |-- /account/change-password (required)
  |                                |-- Set password → /dashboard
  |                                |
  |                                |-- Future: /login + email + password
```

### Journey 2 — Password reset (admin)

```
Admin -- Reset password --> recovery link --> same confirm flow --> change-password (required)
Previous password is retired before link is minted.
```

### Journey 3 — Voluntary password change

```
Dashboard → Sidebar / Settings → Change password → optional mode (back link visible)
```

### Journey 4 — Failure paths

| Trigger | Destination | User sees |
|---|---|---|
| Invalid / missing token | `/login?error=link_invalid` | Red alert on login form |
| Expired / reused token | `/login?error=link_expired` | Red alert on login form |
| Portal disabled | `/login?error=PORTAL_DISABLED` | Red alert |
| No profile | `/login?error=NO_PROFILE` | Red alert |
| Inactive affiliate | `/login?error=AFFILIATE_INACTIVE` | Red alert after sign-in attempt |
| Wrong password | `/login` | "Invalid email or password" |

---

## Systems touched

```
┌─────────────────────────────┐     ┌──────────────────────────────┐
│ Admin (Vercel prod)         │     │ Supabase Auth                │
│ AffiliatePortalPanel        │────▶│ generateLink (invite/recovery)│
│ PortalCredentialsDialog     │     │ verifyOtp (via /auth/confirm)│
└─────────────────────────────┘     └──────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌─────────────────────────────┐     ┌──────────────────────────────┐
│ ts-affiliate-platform       │     │ Prisma Profile               │
│ /login                      │     │ mustChangePassword           │
│ /auth/confirm               │     │ portalDisabledAt             │
│ /account/change-password    │     │ role, affiliateId            │
│ middleware (cookie gate)    │     └──────────────────────────────┘
└─────────────────────────────┘
```

**Key files**

| Concern | Path |
|---|---|
| Invite / reset | `lib/admin/affiliate-portal.ts`, `lib/admin/portal-credentials.ts` |
| Admin UI | `components/admin/AffiliatePortalPanel.tsx`, `components/admin/PortalCredentialsDialog.tsx` |
| Redemption | `app/auth/confirm/route.ts` |
| Login | `app/(auth)/login/page.tsx` |
| Change password | `app/(affiliate)/account/change-password/page.tsx`, `components/account/ChangePasswordForm.tsx` |
| Validation | `lib/account/change-password-validation.ts` |
| Copy | `lib/affiliate/copy.ts` → `account.changePassword` |
| Guards | `middleware.ts`, `app/api/me/route.ts`, `lib/env-guard.ts` |
| Smoke test | `scripts/portal-link-smoke.ts` |

---

## Milestone dependency graph

```
A0 Decisions & config audit
 │
 ▼
A1 Automated QA (smoke + guard-check)
 │
 ▼
A2 Onboarding UI (minimal shell + login polish)
 │
 ▼
A3 Admin UX (credentials dialog + portal panel clarity)
 │
 ▼
A4 Manual QA matrix (desktop + mobile)
 │
 ▼
A5 B/T/E pilot invites + 48h soak
 │
 ▼
A6 Broader onboarding + WP redirect (M6)
```

---

## UI specification

### Design principles

- **Mobile-first inputs:** `h-11 text-base` below `sm`, `h-9 text-sm` at `sm+` (prevents iOS zoom).
- **Touch targets:** minimum 44×44px for icon buttons (show/hide password, hamburger).
- **Safe areas:** `env(safe-area-inset-*)` on full-viewport auth pages.
- **No double padding:** auth pages get horizontal padding from **one** wrapper only.
- **Errors:** `role="alert"`, focus moved to error on display.
- **Brand:** "TRUE SCIENCES" eyebrow + "Ambassador Portal" sub-label where applicable.

### A2.1 — Login page (`/login`)

**Layout:** standalone full-viewport card (`max-w-md`), no sidebar.

| Element | Desktop (≥640px) | Mobile (<640px) |
|---|---|---|
| Title | `text-2xl` — "Ambassador Portal Sign In" | `text-xl` |
| Inputs | `h-9 text-sm` | `h-11 text-base` |
| Submit CTA | Full width; label **"Sign in"** or short variant | Same; avoid wrapping |
| Footer | "Contact administrator to reset" — no forgot-password link | Same, `text-xs` |
| Error banner | Above submit, destructive border + bg | Same |

**States to implement / verify**

- [ ] Empty (submit disabled)
- [ ] Loading ("Signing in…" + spinner)
- [ ] Invalid credentials
- [ ] Block codes: `link_invalid`, `link_expired`, `PORTAL_DISABLED`, `NO_PROFILE`, `AFFILIATE_INACTIVE`
- [ ] Suspense skeleton while `useSearchParams` hydrates

**Fix in A2:** remove duplicate `px-4` (`Providers.tsx` vs login page — keep one).

### A2.2 — Onboarding change-password (required mode)

**When:** `user.mustChangePassword === true` (after invite/recovery link or stale flag).

**Layout:** **minimal onboarding shell** — NOT full `AffiliateShell`.

```
┌─────────────────────────────────────────┐
│  TRUE SCIENCES                          │
│  Ambassador Portal                      │
├─────────────────────────────────────────┤
│  ⚠ Set a password before using the      │
│    portal. Your sign-in link cannot      │
│    be used again.                        │
│                                          │
│  Choose your password                    │
│  ┌─────────────────────────────────┐  │
│  │ New password                     │  │
│  │ Confirm password                 │  │
│  │ ○ At least 12 characters         │  │
│  │ ○ Not email / easy pattern       │  │
│  │ ○ Passwords match                │  │
│  │ [ Continue to dashboard ]        │  │
│  └─────────────────────────────────┘  │
│  Need help? Contact administrator…      │
└─────────────────────────────────────────┘
```

| Rule | Detail |
|---|---|
| No sidebar / hamburger | Affiliate must not see dashboard nav until password set |
| No "Back to dashboard" link | Hidden in required mode (already in page) |
| Sign out | Optional text link in footer — allows escape if wrong account |
| Success | Checkmark + auto-redirect ~900ms → `/dashboard` |
| Middleware | Existing cookie gate remains; shell change is presentation only |

**Implementation sketch:** new `OnboardingShell` component OR `AffiliateShell` prop `variant="onboarding"` that renders header-only wrapper.

### A2.3 — Voluntary change-password (optional mode)

**When:** affiliate navigates from sidebar or Settings.

**Layout:** existing `AffiliateShell` + back link to dashboard.

No change to structure; verify mobile drawer + form scroll with keyboard open.

### A2.4 — Admin credentials dialog

**When:** after Create login or Reset password.

| Element | Desktop | Mobile |
|---|---|---|
| Dialog width | `max-w-md` centered | Full width minus `p-4`, scrollable |
| Warning callout | Prefetch / single-use / expiry | Same, readable `text-xs` |
| Copy fields | Truncated link + copy button | Link wraps or horizontal scroll in `<code>` |
| Invite message `<pre>` | `max-h-32` scroll | `max-h-40` on small screens |
| Footer actions | Row: Copy message \| Done | Stack full-width buttons |
| Auto-copy | On open, toast if clipboard blocked | Same |

### A2.5 — Admin portal panel

| State | Primary action | Secondary |
|---|---|---|
| No portal access | **Create login** | — |
| Has access, password set | **Reset password** | Disable, Sign out, View as |
| Has access, `mustChangePassword` | Badge: "Password not set" | **Reset password** (re-issue link) |
| Disabled | **Enable access** | — |

**Fix in A3:** if `portal.hasAccess`, hide or disable **Create login**; show helper text "Use Reset password to send a new link."

---

## Milestone A0 — Decisions & config audit

**Goal:** Confirm production config matches what copy and links promise.

### Tasks

- [ ] Sign off **Decisions** table above
- [ ] Vercel prod: verify `NEXT_PUBLIC_APP_URL=https://ts-affiliates.vercel.app`
- [ ] Vercel prod: confirm `ALLOW_PRODUCTION_WRITES=true` before issuing real invites
- [ ] Supabase: Authentication → **Email OTP expiration** = 24h (match `PORTAL_LINK_TTL_HOURS`)
- [ ] Supabase: enable **Leaked password protection**
- [ ] Supabase: confirm site URL / redirect allowlist includes prod origin (if used)
- [ ] Document who delivers B/T/E links (Gavin? Anthony?) and via which channel

### Exit criteria

- [ ] Config checklist signed off in this doc or team channel
- [ ] Opening a freshly generated prod link shows `ts-affiliates.vercel.app` in URL (not localhost)

---

## Milestone A1 — Automated QA

**Goal:** Prove link mechanics on local Supabase before touching prod affiliates.

### Tasks

- [ ] `supabase start` (Mode C)
- [ ] `npm run cohort seed` + `npm run sync:local` if cohort affiliate missing
- [ ] `npm run portal-link-smoke` — all checks pass
- [ ] `npm run guard-check` — all 6 cases pass
- [ ] `npm run build` — no ESLint / type errors

### Exit criteria

- [ ] Smoke output saved or screenshot for pilot records
- [ ] No failures in invite → redeem → change-password → login cycle locally

---

## Milestone A2 — Onboarding UI & login polish

**Goal:** First-time affiliate experience feels intentional on phone and desktop.

### Tasks

- [ ] Implement **minimal onboarding shell** for required change-password (see UI spec A2.2)
- [ ] Fix login **double horizontal padding** (`Providers.tsx` and/or login page)
- [ ] Shorten mobile submit label if CTA wraps (e.g. "Sign in" on narrow viewports)
- [ ] Optional: add subtle sign-out link on onboarding shell footer
- [ ] Verify `ChangePasswordForm` success redirect works from minimal shell
- [ ] Ensure middleware still redirects `/dashboard` → change-password when cookie set

### Files likely touched

- `components/layout/AffiliateShell.tsx` or new `components/layout/OnboardingShell.tsx`
- `app/(affiliate)/account/change-password/page.tsx`
- `app/(affiliate)/layout.tsx` (conditional shell)
- `components/Providers.tsx`
- `app/(auth)/login/page.tsx`

### Exit criteria

- [ ] Required change-password renders **without** sidebar nav (desktop + mobile)
- [ ] Voluntary change-password still uses full shell + back link
- [ ] Login card uses full intended width on 390px viewport
- [ ] `npm run build` passes

---

## Milestone A3 — Admin UX

**Goal:** Admins cannot accidentally burn invites or miss the reset path.

### Tasks

- [ ] Portal panel: hide/disable **Create login** when `portal.hasAccess`
- [ ] Portal panel: helper copy when access exists ("Reset password to send a new link")
- [ ] Credentials dialog: mobile footer stack, sticky copy action if needed
- [ ] Credentials dialog: test `<pre>` invite message scroll on small screen
- [ ] Confirm toast on `linked: true` (no link) explains next step

### Exit criteria

- [ ] Admin cannot click Create login twice expecting a new link
- [ ] Dialog usable on 390px width without horizontal page scroll
- [ ] Copy message + copy link both work on Safari iOS (clipboard API fallback)

---

## Milestone A4 — Manual QA matrix

**Goal:** Sign off desktop + mobile before B/T/E receive links.

Use **one throwaway test affiliate** on prod (not B/T/E) OR full local Mode C run plus prod visual check on login-only pages.

### Environment matrix

| # | Scenario | Desktop | Mobile (Safari) | Mobile (Chrome) | Pass |
|---|---|:---:|:---:|:---:|:---:|
| 1 | Login page load | ☐ | ☐ | ☐ | |
| 2 | Login invalid password | ☐ | ☐ | ☐ | |
| 3 | Login with `?error=link_expired` | ☐ | ☐ | ☐ | |
| 4 | Deep link `/account/change-password` → login preserves `next` | ☐ | ☐ | ☐ | |
| 5 | Invite link → change-password (required shell) | ☐ | ☐ | ☐ | |
| 6 | Weak password rejected inline | ☐ | ☐ | ☐ | |
| 7 | Valid password → dashboard | ☐ | ☐ | ☐ | |
| 8 | Sign out → login → sign in again | ☐ | ☐ | ☐ | |
| 9 | Navigate to `/dashboard` before password set → redirected back | ☐ | ☐ | ☐ | |
| 10 | Admin reset → old password dead | ☐ | ☐ | ☐ | |
| 11 | Used link → login error | ☐ | ☐ | ☐ | |
| 12 | Admin create login dialog copy | ☐ | ☐ | ☐ | |
| 13 | Voluntary change-password from Settings | ☐ | ☐ | ☐ | |
| 14 | Keyboard: password fields not hidden behind keyboard (mobile) | — | ☐ | ☐ | |

### Accessibility spot-check

- [ ] Error regions announced (`role="alert"`)
- [ ] Show/hide password buttons have `aria-label` + `aria-pressed`
- [ ] Focus order logical on login and change-password forms
- [ ] Color contrast on warning banner (required mode)

### Exit criteria

- [ ] All rows checked for at least one mobile browser + desktop
- [ ] No P0/P1 issues open
- [ ] QA sign-off date recorded below

---

## Milestone A5 — B/T/E pilot

**Gate:** [BTE-ADMIN-QA.md](./BTE-ADMIN-QA.md) signed off by Anthony + Gavin **before** any B/T/E portal login or outbound PDF.

**Goal:** Blair, Trin, Emmie live on platform with commission drawer verified.

### Pre-invite checklist (each affiliate)

- [ ] Affiliate row exists in prod Supabase with correct email
- [ ] Status = ACTIVE
- [ ] No existing `Profile` OR deliberate reset path chosen
- [ ] TRUE30 PDF / comms sent separately (if applicable)

### Invite procedure (prod)

1. Log into **prod** admin → Affiliate detail
2. **Create login** (or **Reset password** if profile exists)
3. Copy invite message immediately
4. Deliver via agreed channel — **avoid link-preview scanners** where possible
5. Confirm affiliate reached change-password (they tell you) before closing ticket

### Post-login spot-check (each)

- [ ] Dashboard loads, commissions visible
- [ ] Open one **lifetime** commission drawer — order count / subtotal sane
- [ ] Open one **link** commission drawer — journey timeline present
- [ ] Payouts tab loads
- [ ] Mobile: repeat drawer open on phone

### 48h soak

- [ ] No "can't log in" support messages
- [ ] No "link already used" without explanation
- [ ] Sync running (cron / manual) — new commissions appear

### Exit criteria

- [ ] All three have set passwords and logged in at least once on mobile
- [ ] 48h elapsed with zero auth P0 tickets
- [ ] Pilot sign-off recorded

---

## Milestone A6 — Broader onboarding & M6 tie-in

**Goal:** Scale invites beyond B/T/E; gate WP redirect on onboarding progress.

### Tasks

- [ ] Export list: 48 affiliates earning in last 90 days without `Profile` (`scripts/m6-prod-audit.ts`)
- [ ] Batch invite plan (e.g. 10/week) — manual delivery does not scale instantly
- [ ] WP redirect `/affiliate-account/` → platform (M6 task in migration doc)
- [ ] Optional: Supabase hook on `slicewp_register_affiliate` for auto-provision
- [ ] Remove SliceWP affiliate UI overrides **after** redirect + 48h pilot

### Exit criteria

- [ ] Redirect live; B/T/E confirm old WP portal URL forwards
- [ ] Recently-earning cohort onboarding % tracked
- [ ] Migration doc M6 exit criteria updated

---

## Ops runbook

### Invite message template (auto-generated; do not edit link manually)

```
Hi {name},

Your True Sciences ambassador portal is ready.

Choose your password here:
https://ts-affiliates.vercel.app/auth/confirm?token_hash=…&type=invite&next=/account/change-password

The link can be used once and expires in 24 hours.
Ask us for a new one if it runs out.

After that you'll sign in with {email} and the password you chose.
```

### Delivery guidelines

| Do | Don't |
|---|---|
| Send plain text with link on its own line | Paste link in Slack unfurl-heavy channels without warning |
| Tell affiliate to tap once when ready | Forward the admin copy with preview bots |
| Use Reset password for re-issue | Click Create login when profile already exists |
| Generate invites on **Vercel prod** | Run invite scripts against prod DB from local without guard override |

### Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Link opens login with "expired or already used" | Prefetch, double-click, or TTL passed | Admin → Reset password → new link |
| Link goes to localhost | `NEXT_PUBLIC_APP_URL` wrong | Fix Vercel env, re-issue |
| "Account not set up" | No Profile row | Create login from admin |
| "Portal access disabled" | `portalDisabledAt` set | Admin → Enable access |
| Password form succeeds but dashboard loops | Cookie / session mismatch | Sign out, sign in with new password |
| Invite button succeeds but no dialog | `linked: true` (profile already existed) | Use Reset password |

---

## Testing commands

```bash
# Local automated (Mode C)
npm run portal-link-smoke
npm run guard-check
npm run build

# Prod read-only audit
npx tsx scripts/m6-prod-audit.ts "<prod DIRECT_URL>"

# Prod customer-id sanity (from machine with DB access)
npx tsx scripts/_check-customer-backfill.ts
```

---

## Rollback

| Change | Rollback |
|---|---|
| A2 UI deploy | Revert Vercel deployment; auth logic unchanged |
| Issued invite link | Cannot un-issue; use Disable access if compromised |
| Wrong affiliate invited | Disable portal access + sign out sessions |
| WP redirect | Remove redirect rule; affiliates use WP portal again |

---

## Progress tracker

| Milestone | Status | Date |
|---|---|---|
| A0 Config audit | ✅ | 2026-09-06 |
| A1 Automated QA | ✅ | 2026-09-06 |
| A2 Onboarding UI | ✅ | 2026-09-06 |
| A3 Admin UX | ✅ | 2026-09-06 |
| A4 Manual QA matrix | ☐ | |
| A5 B/T/E pilot | ☐ | |
| A6 Broader onboarding | ☐ | |

**QA sign-off:** _______________ **Date:** _______________

**Pilot sign-off (B/T/E):** _______________ **Date:** _______________

---

## Changelog

| Date | Change |
|---|---|
| 2026-09-06 | Initial spec — auth/onboarding polish + B/T/E pilot plan |
