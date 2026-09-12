import { Commission, DealBasis, DealRule, Prisma } from "@prisma/client";
import { roundCurrency, toNumber } from "./format";

export type DealRuleMetadata = {
  /** Pay sponsor as recruit commission ÷ N (ops spreadsheet math). */
  commissionDivisor?: number;
};

export function parseDealRuleMetadata(
  metadata: Prisma.JsonValue | null
): DealRuleMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const raw = metadata as Record<string, unknown>;
  const divisor = raw.commissionDivisor;
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

export function calculateOverrideAmount(
  rule: Pick<DealRule, "basis" | "ratePercent" | "metadata">,
  commission: Pick<Commission, "amount" | "orderRevenue">
): number {
  const rate = toNumber(rule.ratePercent) / 100;
  const divisor = getCommissionDivisor(rule);

  switch (rule.basis) {
    case DealBasis.ORDER_REVENUE:
      return roundCurrency(toNumber(commission.orderRevenue) * rate);
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
  if (getCommissionDivisor(rule)) {
    return `commission-third|${rule.basis}`;
  }
  return `${toNumber(rule.ratePercent)}|${rule.basis}`;
}

export function teamRuleRateLabel(
  rule: Pick<DealRule, "ratePercent" | "metadata">
): string {
  return teamRuleRateLabelFromDivisor(
    rule.ratePercent,
    getCommissionDivisor(rule)
  );
}

export function teamRuleRateLabelFromDivisor(
  ratePercent: string | number | { toString(): string },
  commissionDivisor: number | null | undefined
): string {
  if (commissionDivisor === 3) return "⅓ of their commission";
  if (commissionDivisor) return `1/${commissionDivisor} of their commission`;
  return `${toNumber(ratePercent)}%`;
}
