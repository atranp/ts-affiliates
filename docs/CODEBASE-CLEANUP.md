# Codebase cleanup — spec and plan

Branch: `cursor/codebase-cleanup-ffe6`. Every change here is meant to be
behaviour-preserving unless it is listed under "Intentional behaviour changes".

## Goals

1. **Smaller files with one job each.** Pages wire data to components; they do
   not define five components inline.
2. **One way to do server state.** Reads through TanStack Query hooks, writes
   through `useMutation`, cache keys only from `lib/query-keys.ts`.
3. **URL state for navigable views.** Shared links and the back button land
   where the user expects (the affiliate dashboard already worked this way; the
   logic is now reusable).
4. **A `lib/` you can navigate.** Related modules live in a folder; the root
   holds only cross-cutting utilities.
5. **No dead code, no history in comments.** Comments state constraints the
   code cannot show.

## Ground rules

- No response-shape or status changes in API routes except the ones listed
  below.
- Large moves are mechanical (import rewriting, verbatim function moves) and
  are checked mechanically. For example, the `lib/sync.ts` split was compared
  line by line against the original.
- `scripts/` are one-off ops scripts, often against production. They are never
  deleted here; their imports are updated when a module moves.
- Verification for every step: `npx tsc --noEmit`, `npm run lint`, and
  `next build`, plus a browser pass over the touched screens in mock mode (and
  against a local Postgres for routes without mock branches).

## Findings

| Area | Finding |
| --- | --- |
| Large files | `TeamsPanel` 1125 lines, `lib/sync.ts` 1050, `deal-rules/page` 963, `dashboard/page` 873, `affiliates/[id]/page` 760, `CreatePayoutPanel` 715. |
| Server state | Deprecated `adminMutate` plus local `saving`/`submitting` flags for every admin write. `useAdminMutation` existed and nothing used it. |
| Query keys | About a dozen inline key arrays. `["team", id]` was used both for team-by-id and team-roster-by-affiliate, so the two caches could collide. |
| Polling | `useSyncStatus` hand-rolled a `setTimeout` loop around `apiFetch`. |
| Modals | Three dialogs re-implemented the fixed overlay instead of `DialogOverlay` (no portal, no Escape, no scroll lock). |
| Edge middleware | `middleware.ts` imported cookie helpers from `lib/auth-role.ts`, which imports Prisma and the Supabase admin client, and it duplicated the mock-mode flags from `lib/mock/config.ts`. |
| `lib/` layout | 27 root modules; `sync-*`, `slicewp*`, `auth*`, and `api-*` lived side by side with nothing grouping them. |
| Duplication | `SortableHead` (ledger and team roster), `formatPayoutWeek` (both ledger tables), the affiliate `statusBadgeVariant` (list and detail page), the sponsor-prefill fetch-and-map (deal rules and teams). |
| API routes | Four copies of the JSON body parse-or-400 block; five routes called `request.json()` bare, so malformed JSON became an unhandled 500. |
| Dead code | Deprecated `*Utc*` date aliases, `adminMutate`, `useAdminMutation`, `useAdminAffiliatePicker`, `mockModeBlockedResponse`, `processDealRulesForCommission`, `fetchWooOrderById`, `fetchSliceWPCommissionsByOrder`, `AppShell`, `CommissionStatusBadge`, `AttributionBars`, and several copy helpers. |
| Comments | Low density and mostly good. Five referred to project milestones ("until Milestone 6", "by M4") rather than to constraints. |

## Done on this branch

### State management
- `lib/query-keys.ts` is the only source of cache keys. Team detail and team
  roster have distinct namespaces (`["team", teamId]` and
  `["team-roster", affiliateId]`).
- `hooks/use-teams.ts` and `hooks/use-payouts.ts` replace hooks that were
  colocated in components.
- Admin writes use `useMutation`:
  - deal rules: create, update, delete;
  - teams: create, delete;
  - the affiliate ledger (`hooks/use-admin-ledger-mutations.ts`): edit, bulk
    status, adjustment.
- `useSyncStatus` is a `useQuery` with a running/idle `refetchInterval`.
- `hooks/use-url-params.ts` (`setParams`, history vs. replace) and
  `hooks/use-ledger-url-filters.ts` (ledger filters, sort, page, debounced
  search, and the export link built from the same values as the table query).
- `hooks/use-debounced-value.ts` and `hooks/use-slicewp-pre-sync.ts`.

### Smaller files
| Before | After |
| --- | --- |
| `app/(admin)/admin/deal-rules/page.tsx` 963 | 324, plus `components/admin/deal-rules/*` (draft model and validation, fields, dialog, table) |
| `app/(affiliate)/dashboard/page.tsx` 873 | 419, plus `components/affiliate/dashboard/*` (tab panel, overview, team bonuses) |
| `components/TeamsPanel.tsx` 1125 | 158, plus `components/teams/*` (stats, member rows, roster, detail section, card) |
| `app/(admin)/admin/affiliates/[id]/page.tsx` 760 | 306, plus `components/admin/affiliate-detail/*` (stats, sidebar, ledger, teams, rules tabs) |
| `components/payouts/CreatePayoutPanel.tsx` 715 | 318, plus `components/payouts/create/*` and the pre-sync hook |
| `lib/sync.ts` 1050 | `lib/sync/` split into `affiliates`, `commissions`, `affiliate-sync`, `profiles`, `optional-steps`, and `full-sync`, behind `index.ts` |

### `lib/` layout
```
lib/api/          auth.ts (requireAdmin/requireAuth), body.ts, cache.ts, client.ts
lib/auth/         session.ts, role.ts, cookies.ts (edge-safe), impersonation.ts
lib/integrations/ slicewp.ts, slicewp-bridge.ts, slicewp-write.ts, woocommerce.ts, wordpress-auth.ts
lib/sync/         index.ts plus the sync stages, state, write, parity, journey, errors
```
`lib/auth/` deliberately has no `index.ts`: the middleware imports
`lib/auth/cookies` directly, and a barrel would pull Prisma back into the edge
bundle. The middleware bundle is 84 kB on this branch, down from 143 kB on
`main`.

### Shared UI and helpers
- `DialogOverlay` takes a `className` width and backs the adjustment, ledger
  edit, team create, and deal-rule dialogs.
- `components/ui/sortable-head.tsx`, `lib/ledger/format.ts`
  (`formatPayoutWeekLabel`), `lib/admin/format.ts`
  (`affiliateStatusBadgeVariant`), `fetchAffiliateOption`, and
  `lib/api/body.ts` (`readJsonObject`).

### Intentional behaviour changes
- Malformed or non-object JSON bodies return `400 { error: "Invalid JSON body" }`
  instead of an unhandled 500 on these routes: deal-rules create and update,
  teams create and update, and settings save. Routes that already returned 400
  keep their messages.
- The admin affiliate detail page fetches the ledger only while the Ledger tab
  is open, and typing in the ledger search resets to page 1 immediately rather
  than after the debounce.
- Sync-status polling is shared through the query cache instead of running one
  loop per hook instance. Only `AdminShell` uses it today.

## Remaining backlog (not on this branch)

In priority order, with what each touches:

1. **API route wrappers.** Add `withAdmin`/`withAffiliate` for the auth and
   early-return boilerplate (about 55 handlers). The handler keeps ownership of
   mock branches and status codes. 21 routes have no `try/catch`; wrapping them
   changes failure responses, so decide per route.
2. **Pick one "no affiliate linked" response.** Routes currently split between
   `400` "No affiliate linked to this account" and `403` "No affiliate linked".
   This is a product decision first, then a mechanical change.
3. **Move route-embedded business logic into `lib/`:** deal-rules create and
   update validation, the audit-log query and name join, payout batch merging,
   and settings encryption.
4. **SliceWP fetch boilerplate.** `slicewpFetch`, `bridgeFetch`, and
   `slicewpWrite` each resolve credentials and build auth params. Extract
   `resolveSlicewpCredentials()` and one `wpJsonFetch`, keeping writes behind
   `assertWritableStore`.
5. **Remaining large files.**
   - `CommissionsPanel` (537): extract the filter bar.
   - `AdminLedgerTable` (518): extract the edit dialog and bulk confirm.
   - `lib/ledger/commission-detail.ts` (732).
   - `lib/rules-engine.ts` (591).
   - The mock fixtures (1335 and 1055) are data and can stay large.
6. **Admin affiliate detail tabs in the URL**, using `useUrlParams` the way the
   dashboard does, so a tab and filter can be shared.
7. **Local-time dates.** `formatDate` helpers in the affiliate sidebar, the
   portal panel, and the audit log use the browser's time zone rather than
   `APP_TIMEZONE`. Switching to `formatAppDateTime` changes what admins see, so
   it needs sign-off.
8. **Unexport internal-only helpers** that knip flags (for example
   `buildUnpaidWhere`, `buildPayoutLabel`, `ledgerInclude`). Confirm each
   against `scripts/` first: knip treats `scripts/` as unused files, so it
   misses their imports.

## Needs an owner decision

- **`scripts/`**: knip lists 45 scripts as unreachable. Many are one-off
  production audits or mutations named after specific affiliates and dates (for
  example `mark-trin-blair-sep8-team-paid.ts`). Proposal: move finished
  one-offs to `scripts/archive/` or delete them, and keep the reusable ones
  (`dev-sync`, `bootstrap-*`, `backfill-*`, `verify-*`) with a one-line header
  saying when to run them.
- **Unused shadcn exports** (`DropdownMenu*` sub-components, `badgeVariants`,
  `buttonVariants`) are kept, since they are library surface.
- **`postcss-load-config`** is imported by `postcss.config.mjs` (for its type)
  but is not a declared dependency.
