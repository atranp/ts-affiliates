import { randomUUID } from "crypto";
import { Prisma, PayoutSchedule, type Commission } from "@prisma/client";
import { prisma } from "./prisma";
import { getNextPayoutWeek } from "./payout-schedule";

/**
 * Set-based writes for the sync path.
 *
 * Sync cost is dominated by round-trips, not by database work, so these keep
 * the number of statements constant instead of proportional to row count.
 */

export type CommissionUpsertRow = {
  slicewpId: number;
  affiliateId: string;
  wooOrderId: number | null;
  amount: number;
  orderRevenue: number | null;
  status: string;
  type: string | null;
  origin: string | null;
  parentSlicewpId: number | null;
  visitSlicewpId: number | null;
  customerSlicewpId: number | null;
  dateCreated: Date;
};

/** One INSERT ... ON CONFLICT for the whole batch, returning the saved rows. */
export async function bulkUpsertCommissions(
  rows: CommissionUpsertRow[],
  syncedAt: Date
): Promise<Commission[]> {
  if (rows.length === 0) return [];

  // Postgres rejects an upsert whose VALUES touch the same conflict target
  // twice, and SliceWP's offset paging can hand us the same commission on two
  // pages. Collapse duplicates, keeping the copy we saw last.
  const unique = Array.from(
    new Map(rows.map((row) => [row.slicewpId, row])).values()
  );

  const values = unique.map(
    (row) => Prisma.sql`(
      ${randomUUID()},
      ${row.slicewpId}::integer,
      ${row.affiliateId},
      ${row.wooOrderId}::integer,
      ${String(row.amount)}::numeric,
      ${row.orderRevenue === null ? null : String(row.orderRevenue)}::numeric,
      ${row.status}::"CommissionStatus",
      ${row.type},
      ${row.origin},
      ${row.parentSlicewpId}::integer,
      ${row.visitSlicewpId}::integer,
      ${row.customerSlicewpId}::integer,
      ${row.dateCreated}::timestamptz,
      ${syncedAt}::timestamptz,
      ${syncedAt}::timestamptz
    )`
  );

  return prisma.$queryRaw<Commission[]>`
    INSERT INTO "Commission" (
      "id", "slicewpId", "affiliateId", "wooOrderId", "amount", "orderRevenue",
      "status", "type", "origin", "parentSlicewpId", "visitSlicewpId",
      "customerSlicewpId", "dateCreated", "syncedAt", "updatedAt"
    )
    VALUES ${Prisma.join(values)}
    ON CONFLICT ("slicewpId") DO UPDATE SET
      "affiliateId"       = EXCLUDED."affiliateId",
      "wooOrderId"        = EXCLUDED."wooOrderId",
      "amount"            = EXCLUDED."amount",
      "orderRevenue"      = EXCLUDED."orderRevenue",
      "status"            = EXCLUDED."status",
      "type"              = EXCLUDED."type",
      "origin"            = EXCLUDED."origin",
      "parentSlicewpId"   = EXCLUDED."parentSlicewpId",
      "visitSlicewpId"    = EXCLUDED."visitSlicewpId",
      "customerSlicewpId" = EXCLUDED."customerSlicewpId",
      "dateCreated"       = EXCLUDED."dateCreated",
      "syncedAt"          = EXCLUDED."syncedAt",
      "updatedAt"         = EXCLUDED."updatedAt"
    RETURNING *
  `;
}

/**
 * The order figure the commission rate was applied to — see `commissionBaseFrom`
 * in lib/revenue.ts, which this mirrors in SQL.
 *
 * Refunds and order edits can leave `reference_amount` below the shipping and
 * tax later read off the order, so a non-positive result is stored as unknown
 * rather than as a sale of nothing.
 */
const COMMISSION_BASE = Prisma.sql`
  CASE
    WHEN c."orderRevenue"
       - COALESCE(oa."orderShipping", 0)
       - COALESCE(oa."orderTax", 0) > 0
    THEN round(
      c."orderRevenue"
        - COALESCE(oa."orderShipping", 0)
        - COALESCE(oa."orderTax", 0),
      2
    )
    ELSE NULL
  END
`;

/**
 * Recomputes `Commission.commissionBase` from whatever order totals are on file.
 *
 * Split from the commission upsert because the two arrive out of order: a sale
 * syncs from SliceWP immediately, while its Woo totals come from the bridge
 * afterwards and only 75 orders per run. Running this as its own set-based pass
 * means each sync picks up every order enriched since the last one, and it is
 * safe to re-run at any time.
 */
export async function syncCommissionBases(
  affiliateIds?: string[]
): Promise<number> {
  if (affiliateIds?.length === 0) return 0;

  return prisma.$executeRaw`
    UPDATE "Commission" AS c
    SET "commissionBase" = ${COMMISSION_BASE},
        "updatedAt"      = now()
    FROM "OrderAttribution" AS oa
    WHERE oa."wooOrderId" = c."wooOrderId"
      AND oa."orderTotal" IS NOT NULL
      AND c."orderRevenue" IS NOT NULL
      ${affiliateScope(affiliateIds)}
      AND c."commissionBase" IS DISTINCT FROM ${COMMISSION_BASE}
  `;
}

/**
 * Copies `Commission.commissionBase` onto every ledger line derived from it.
 *
 * Covers overrides as well as direct lines: a sponsor's row quotes the recruit's
 * sale, and that has to be the same figure the recruit sees.
 */
export async function syncLedgerCommissionBases(): Promise<number> {
  return prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "commissionBase" = c."commissionBase",
        "updatedAt"      = now()
    FROM "Commission" AS c
    WHERE le."sourceCommissionId" = c."id"
      AND le."commissionBase" IS DISTINCT FROM c."commissionBase"
  `;
}

export type OverrideUpdateRow = {
  id: string;
  amount: number;
  status: string;
  description: string;
  orderRevenue: number | null;
  commissionBase: number | null;
  wooOrderId: number | null;
  sourceAffiliateId: string;
  occurredAt: Date;
};

/** One UPDATE ... FROM (VALUES ...) instead of a statement per override. */
export async function bulkUpdateOverrideEntries(
  rows: OverrideUpdateRow[]
): Promise<number> {
  if (rows.length === 0) return 0;

  const values = rows.map(
    (row) => Prisma.sql`(
      ${row.id},
      ${String(row.amount)}::numeric,
      ${row.status}::"CommissionStatus",
      ${row.description},
      ${row.orderRevenue === null ? null : String(row.orderRevenue)}::numeric,
      ${row.commissionBase === null ? null : String(row.commissionBase)}::numeric,
      ${row.wooOrderId}::integer,
      ${row.sourceAffiliateId},
      ${row.occurredAt}::timestamptz
    )`
  );

  return prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "amount"            = v.amount,
        "status"            = v.status,
        "description"       = v.description,
        "orderRevenue"      = v.order_revenue,
        "commissionBase"    = v.commission_base,
        "wooOrderId"        = v.woo_order_id,
        "sourceAffiliateId" = v.source_affiliate_id,
        "occurredAt"        = v.occurred_at,
        "updatedAt"         = now()
    FROM (VALUES ${Prisma.join(values)}) AS v(
      id, amount, status, description, order_revenue, commission_base,
      woo_order_id, source_affiliate_id, occurred_at
    )
    WHERE le."id" = v.id
  `;
}

/**
 * Creates or refreshes one downline team per sponsor in a single statement.
 * Mirrors ensureSponsorDownlineTeam, which stays for the single-affiliate path.
 */
export async function syncDownlineTeams(slicewpKey: string): Promise<number> {
  return prisma.$executeRaw`
    INSERT INTO "Team" (
      "id", "name", "description", "sponsorAffiliateId", "slicewpKey",
      "active", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      COALESCE(a."displayName", split_part(a."email", '@', 1)) || '''s Downline',
      'Synced from SliceWP parent/recruit relationships',
      a."id",
      ${slicewpKey},
      TRUE,
      now(),
      now()
    FROM "Affiliate" AS a
    WHERE EXISTS (
      SELECT 1 FROM "Affiliate" AS child
      WHERE child."parentAffiliateId" = a."id"
    )
    ON CONFLICT ("sponsorAffiliateId", "slicewpKey") DO UPDATE
      SET "name"      = EXCLUDED."name",
          "active"    = TRUE,
          "updatedAt" = now()
  `;
}

function affiliateScope(affiliateIds?: string[]) {
  if (!affiliateIds) return Prisma.empty;
  return Prisma.sql`AND c."affiliateId" IN (${Prisma.join(affiliateIds)})`;
}

/**
 * The affiliate ledger folds the order number into the description column, so
 * this carries it rather than repeating it in a column of its own.
 */
const DIRECT_DESCRIPTION = Prisma.sql`
  CASE
    WHEN c."wooOrderId" IS NOT NULL THEN 'Order #' || c."wooOrderId"
    ELSE 'Direct commission'
  END
`;

/**
 * SliceWP emits its own tier-2 commission ("inherit") alongside the tier-1
 * sale. We model that bonus ourselves as an OVERRIDE driven by deal rules, so
 * mirroring SliceWP's copy as well would bill the same tier-2 bonus twice.
 *
 * Existing inherit-backed rows are left alone here: most sit inside settled
 * payout batches, which have to keep reconciling.
 */
const EXCLUDE_INHERITED = Prisma.sql`AND lower(coalesce(c."type", '')) <> 'inherit'`;

/**
 * Once an entry sits in a payout batch, its status belongs to that payout.
 * SliceWP only learns the commission was settled when write-back lands, so
 * mirroring its status unconditionally would walk a paid entry back to unpaid
 * in the window before that happens — or permanently, if write-back failed.
 * Every other column keeps mirroring, so a later refund or amount change on a
 * settled commission still surfaces as a discrepancy.
 */
const SYNCED_STATUS = Prisma.sql`
  CASE WHEN le."payoutBatchId" IS NULL THEN c."status" ELSE le."status" END
`;

/**
 * DIRECT ledger lines mirror their commission exactly, so they can be derived
 * in SQL rather than diffed row by row in application code.
 */
export async function syncDirectLedgerEntries(
  affiliateIds?: string[]
): Promise<{ created: number; updated: number }> {
  if (affiliateIds?.length === 0) return { created: 0, updated: 0 };

  const scope = affiliateScope(affiliateIds);

  const updated = await prisma.$executeRaw`
    UPDATE "LedgerEntry" AS le
    SET "amount"         = c."amount",
        "status"         = ${SYNCED_STATUS},
        "orderRevenue"   = c."orderRevenue",
        "commissionBase" = c."commissionBase",
        "wooOrderId"     = c."wooOrderId",
        "occurredAt"     = c."dateCreated",
        "description"    = ${DIRECT_DESCRIPTION},
        "updatedAt"      = now()
    FROM "Commission" AS c
    WHERE le."type" = 'DIRECT'
      AND le."slicewpCommissionId" = c."slicewpId"
      AND le."affiliateId" = c."affiliateId"
      ${scope}
      AND (
        le."amount"       IS DISTINCT FROM c."amount"
        OR le."status"         IS DISTINCT FROM ${SYNCED_STATUS}
        OR le."orderRevenue"   IS DISTINCT FROM c."orderRevenue"
        OR le."commissionBase" IS DISTINCT FROM c."commissionBase"
        OR le."wooOrderId"     IS DISTINCT FROM c."wooOrderId"
        OR le."occurredAt"     IS DISTINCT FROM c."dateCreated"
        OR le."description"    IS DISTINCT FROM ${DIRECT_DESCRIPTION}
      )
  `;

  const payoutWeek = getNextPayoutWeek(PayoutSchedule.WEEKLY_MONDAY);

  const created = await prisma.$executeRaw`
    INSERT INTO "LedgerEntry" (
      "id", "affiliateId", "type", "amount", "status", "description",
      "wooOrderId", "orderRevenue", "commissionBase", "sourceCommissionId",
      "slicewpCommissionId",
      "payoutWeek", "occurredAt", "createdAt", "updatedAt"
    )
    SELECT
      gen_random_uuid()::text,
      c."affiliateId",
      'DIRECT',
      c."amount",
      c."status",
      ${DIRECT_DESCRIPTION},
      c."wooOrderId",
      c."orderRevenue",
      c."commissionBase",
      c."id",
      c."slicewpId",
      ${payoutWeek}::timestamptz,
      c."dateCreated",
      now(),
      now()
    FROM "Commission" AS c
    WHERE TRUE
      ${scope}
      ${EXCLUDE_INHERITED}
      AND NOT EXISTS (
        SELECT 1 FROM "LedgerEntry" AS le
        WHERE le."type" = 'DIRECT'
          AND le."slicewpCommissionId" = c."slicewpId"
          AND le."affiliateId" = c."affiliateId"
      )
  `;

  return { created, updated };
}
