import { CommissionStatus, type Prisma } from "@prisma/client";

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
