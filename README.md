# TS Affiliate Platform

Affiliate management portal for True Sciences. Syncs SliceWP data from WooCommerce, applies custom deal rules (e.g. sponsor overrides), and gives affiliates a paid/unpaid commission dashboard.

## Stack

- Next.js 14 (App Router)
- Supabase Auth + PostgreSQL
- Prisma ORM
- TanStack Query (client cache)
- SliceWP REST API + WooCommerce REST API

## Setup

1. Create a new Supabase project (separate from the payout calculator).

2. Copy env file:

```bash
cp .env.example .env.local
```

3. Fill in Supabase, database, WooCommerce, and SliceWP credentials.

4. Push schema and seed users:

```bash
npm install
npm run db:push
npm run db:seed
```

5. Start dev server:

```bash
npm run dev
```

## First-run checklist

1. Log in as admin (`anthony@true-sciences.com` / `changeme123` after seed)
2. Go to **Admin → Integration Settings** and save WooCommerce + SliceWP keys
3. Run **Full Sync** on the Admin page
4. Create a deal rule (e.g. Trin 10% of Blair revenue)
5. Run sync again to generate override ledger entries
6. Affiliates log in and view unpaid/paid ledger on Dashboard

## Deal rules

Deal rules let you configure custom payouts that SliceWP cannot handle natively:

| Type | Example |
|---|---|
| `REVENUE_OVERRIDE` | Trin earns 10% of Blair's referred order revenue |
| `COMMISSION_OVERRIDE` | Sponsor earns 10% of recruit's commission |

Rules are evaluated on every commission sync. Override entries appear in the sponsor's ledger with the recruit as source.

## API routes

| Route | Description |
|---|---|
| `POST /api/sync` | Full SliceWP sync (admin or cron bearer token) |
| `GET /api/ledger` | Affiliate commission ledger |
| `POST /api/admin/deal-rules` | Create deal rule |
| `POST /api/admin/payouts/run` | Mark due unpaid entries as paid |

## Cron sync (optional)

Set `SYNC_CRON_SECRET` in Vercel env. A Vercel cron runs `GET /api/sync` every 6 hours (see `vercel.json`). Manual trigger:

```bash
curl -X POST https://your-app.vercel.app/api/sync \
  -H "Authorization: Bearer $SYNC_CRON_SECRET"
```

Page loads read from Supabase/Postgres — SliceWP is only hit during sync jobs.

## Client caching

TanStack Query caches API responses for 60s (`staleTime`). Revisiting admin/affiliate pages is instant until stale or invalidated (e.g. after sync).

## Trin / Blair example

After sync identifies both affiliates in SliceWP:

1. Admin → Deal Rules
2. Name: `Trin 10% of Blair revenue`
3. Sponsor: Trindalyn
4. Recruit: Blair
5. Rate: `10` (% of order revenue)

Trindalyn's dashboard will show team override lines tied to Blair's orders with unpaid/paid tabs.
