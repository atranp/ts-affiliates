import { Commission, DealBasis, DealRule } from "@prisma/client";
import { roundCurrency, toNumber } from "./format";

/**
 * A sponsor's cut of one recruit sale.
 *
 * `ORDER_REVENUE` is a share of the sale, and the share is taken from the
 * commissionable base — the order less shipping and tax — not the gross total.
 * That is what the rate the recruit is paid on is applied to, so a 10% team deal
 * on a recruit paid 30% works out to a third of their commission, which is how
 * the payout spreadsheets have always priced it. Taking the share from the gross
 * total instead quietly overpaid by whatever shipping and tax came to.
 *
 * The rate stays the deal — a recruit on 40% or on a lower lifetime rate yields
 * a different fraction of their commission, and only the rate is stable.
 */
export function calculateOverrideAmount(
  rule: Pick<DealRule, "basis" | "ratePercent">,
  commission: Pick<Commission, "amount" | "orderRevenue" | "commissionBase">
): number {
  const rate = toNumber(rule.ratePercent) / 100;

  switch (rule.basis) {
    case DealBasis.ORDER_REVENUE:
      return roundCurrency(
        toNumber(commission.commissionBase ?? commission.orderRevenue) * rate
      );
    case DealBasis.RECRUIT_COMMISSION:
      return roundCurrency(toNumber(commission.amount) * rate);
    case DealBasis.FIXED:
      return roundCurrency(toNumber(rule.ratePercent));
    default:
      return 0;
  }
}

/** Stable key for grouping payout math labels. */
export function payoutMathTerm(
  rule: Pick<DealRule, "ratePercent" | "basis"> | null
): string | null {
  if (!rule) return null;
  return `${toNumber(rule.ratePercent)}|${rule.basis}`;
}
