import { CommissionStatus, Prisma } from "@prisma/client";
import { prisma } from "./prisma";

/**
 * Commission statuses SliceWP counts as referral sales.
 *
 * Its Reports → Sales page sums `reference_amount` across `unpaid` and `paid`
 * commissions only. Rejected rows are refunded or disallowed orders and pending
 * rows are not confirmed yet, so neither is revenue the affiliate made.
 */
export const REVENUE_COUNTING_STATUSES = [
  CommissionStatus.UNPAID,
  CommissionStatus.PAID,
] as const;

/**
 * The filter for any "how much has this affiliate sold" total.
 *
 * Matching SliceWP matters because affiliates and admins read both screens and
 * compare them. Filtering on `orderRevenue` alone also swept in rejected and
 * pending commissions, which is what made portal sales figures read high.
 *
 * Used for milestone progress as well as display, so the number on a roster row
 * and the goal bar beside it always come from the same definition.
 */
export const countableRevenueWhere = {
  orderRevenue: { not: null },
  status: { in: [...REVENUE_COUNTING_STATUSES] },
} satisfies Prisma.CommissionWhereInput;

const COUNTING_STATUSES = new Set<CommissionStatus>(REVENUE_COUNTING_STATUSES);

/**
 * The order figure a commission rate is actually applied to.
 *
 * SliceWP records `reference_amount` as the gross order total, but calculates
 * the commission on the order less shipping and tax. Measured across the book,
 * 92% of commissions land on a round rate against this and only 23% against the
 * gross total, and the blended rate reads 29.97% rather than 26.94% — which is
 * the 30% the payout spreadsheets have always assumed.
 *
 * Returns null when the order's Woo totals have not been fetched yet, so a
 * caller can fall back to gross deliberately rather than quietly reporting a
 * sale as smaller than it was.
 */
export function commissionBaseFrom(order: {
  orderRevenue: unknown;
  orderShipping: unknown;
  orderTax: unknown;
  orderTotal: unknown;
}): number | null {
  const gross = numberOrNull(order.orderRevenue);
  if (gross === null) return null;

  // Without a fetched order there is nothing to subtract, and returning gross
  // here would be indistinguishable from an order that genuinely had neither
  // shipping nor tax.
  if (numberOrNull(order.orderTotal) === null) return null;

  const shipping = numberOrNull(order.orderShipping) ?? 0;
  const tax = numberOrNull(order.orderTax) ?? 0;
  const base = gross - shipping - tax;

  // Refunds and post-hoc order edits can leave reference_amount smaller than
  // the shipping and tax we later read off the order.
  if (base <= 0) return null;

  return Math.round(base * 100) / 100;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const parsed = typeof value === "number" ? value : Number(String(value));
  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * "How much has each of these affiliates sold", answered once.
 *
 * Six call sites — roster stats, admin roster, milestone progress, the override
 * engine, the ledger drawer and status reconciliation — were each running this
 * grouping themselves. They have to agree: a roster row and the goal bar beside
 * it are the same number, and the override engine decides whether that goal has
 * been met.
 *
 * Raw rather than a Prisma `groupBy` because the sum needs COALESCE. Rows whose
 * order has not been fetched yet fall back to the gross total, which overstates
 * them by roughly a tenth — preferable to reporting the sale as zero, and rare
 * enough after a backfill to be a safety net rather than a policy.
 */
export async function countableRevenueByAffiliate(
  affiliateIds: string[],
  period?: { from: Date; to: Date }
): Promise<Map<string, number>> {
  if (affiliateIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    Array<{ affiliateId: string; revenue: Prisma.Decimal | null }>
  >`
    SELECT "affiliateId",
           SUM(COALESCE("commissionBase", "orderRevenue")) AS revenue
    FROM "Commission"
    WHERE "affiliateId" = ANY(${affiliateIds})
      AND "orderRevenue" IS NOT NULL
      AND "status"::text = ANY(${[...REVENUE_COUNTING_STATUSES] as string[]})
      ${
        period
          ? Prisma.sql`AND "dateCreated" >= ${period.from} AND "dateCreated" <= ${period.to}`
          : Prisma.empty
      }
    GROUP BY 1
  `;

  return new Map(
    rows.map((row) => [row.affiliateId, numberOrNull(row.revenue) ?? 0])
  );
}

/** Single-affiliate form of {@link countableRevenueByAffiliate}. */
export async function countableRevenueForAffiliate(
  affiliateId: string
): Promise<number> {
  const byAffiliate = await countableRevenueByAffiliate([affiliateId]);
  return byAffiliate.get(affiliateId) ?? 0;
}

/**
 * In-memory counterpart of `countableRevenueWhere`, for commissions already
 * loaded — the sync accumulates recruit revenue row by row and has to agree
 * with what a later query would return.
 */
export function countsTowardRevenue(commission: {
  status: CommissionStatus;
  orderRevenue: unknown;
}): boolean {
  return (
    commission.orderRevenue != null && COUNTING_STATUSES.has(commission.status)
  );
}
