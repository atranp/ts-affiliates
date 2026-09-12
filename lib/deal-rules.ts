import { Commission, DealBasis, DealRule, Prisma } from "@prisma/client";
import { roundCurrency, toNumber } from "./format";

export type DealRuleMetadata = {
  /**
   * Prices the sponsor's cut as the recruit's commission divided by this,
   * rather than as a share of the recruit's sales.
   *
   * The weekly payout spreadsheets work backwards from what a recruit was paid:
   * assume the standard 30% rate, divide to recover the sale, then take the
   * sponsor's 10% of it — which is the commission divided by three. It stays the
   * divisor and not a rate because the assumed 30% is the convention being
   * applied, not a property of the individual sale. A recruit paid a lower
   * lifetime rate still yields a third of what they earned, so the sponsor's cut
   * always scales with the recruit's.
   */
  commissionDivisor?: number;
};

export function parseDealRuleMetadata(
  metadata: Prisma.JsonValue | null
): DealRuleMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const divisor = (metadata as Record<string, unknown>).commissionDivisor;
  return {
    commissionDivisor:
      typeof divisor === "number" && divisor > 0 ? divisor : undefined,
  };
}

export function getCommissionDivisor(
  rule: Pick<DealRule, "metadata">
): number | null {
  return parseDealRuleMetadata(rule.metadata).commissionDivisor ?? null;
}

/**
 * A sponsor's cut of one recruit sale.
 *
 * `ORDER_REVENUE` takes its share from the commissionable base — the order less
 * shipping and tax — rather than the gross total, since that is the figure the
 * recruit's own rate was applied to. Taking it from gross quietly paid out on
 * shipping and tax nobody earns a commission on.
 */
export function calculateOverrideAmount(
  rule: Pick<DealRule, "basis" | "ratePercent" | "metadata">,
  commission: Pick<Commission, "amount" | "orderRevenue" | "commissionBase">
): number {
  const rate = toNumber(rule.ratePercent) / 100;
  const divisor = getCommissionDivisor(rule);

  switch (rule.basis) {
    case DealBasis.ORDER_REVENUE:
      return roundCurrency(
        toNumber(commission.commissionBase ?? commission.orderRevenue) * rate
      );
    case DealBasis.RECRUIT_COMMISSION:
      if (divisor) {
        return roundCurrency(toNumber(commission.amount) / divisor);
      }
      return roundCurrency(toNumber(commission.amount) * rate);
    case DealBasis.FIXED:
      return roundCurrency(toNumber(rule.ratePercent));
    default:
      return 0;
  }
}

/** Stable key for grouping payout math labels. */
export function payoutMathTerm(
  rule: Pick<DealRule, "ratePercent" | "basis" | "metadata"> | null
): string | null {
  if (!rule) return null;
  const divisor = getCommissionDivisor(rule);
  if (divisor) return `divisor:${divisor}|${rule.basis}`;
  return `${toNumber(rule.ratePercent)}|${rule.basis}`;
}

/**
 * How a team deal reads in the UI.
 *
 * Gavin's spreadsheets recover the sale from what the recruit was paid, but the
 * deal itself is still described as a share of commissionable sales — order total
 * less shipping and tax. The divisor stays in metadata for pricing; only the
 * label changes.
 */
export function payoutDisplayTerm(
  rule: Pick<DealRule, "ratePercent" | "basis" | "metadata"> | null
): string | null {
  if (!rule) return null;
  // TEAM_DEAL marks rules priced from the recruit's commission (Gavin's
  // spreadsheet) so the payout line never reads as "sales × 10%" — that
  // multiplication only checks out when every sale pays the recruit 30%.
  if (getCommissionDivisor(rule)) {
    return `${toNumber(rule.ratePercent)}|TEAM_DEAL`;
  }
  return payoutMathTerm(rule);
}

export function teamDealRateLabel(ratePercent: string | number): string {
  return `${toNumber(ratePercent)}% of commissionable sales`;
}
