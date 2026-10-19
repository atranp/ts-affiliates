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
  /**
   * Negotiated exceptions to the rule's rate, keyed by recruit affiliate id.
   *
   * These live inside the team rule instead of as a second DealRule because
   * rules are additive: a recruit-scoped rule fires *alongside* the team rule
   * rather than replacing it, so the sponsor would earn both rates on that
   * recruit's sales. Keeping the exception here also leaves team membership
   * where it belongs — synced from SliceWP's parent tree.
   */
  memberRates?: Record<string, MemberRate>;
};

export type MemberRate = {
  ratePercent: number;
  /**
   * Set only to break from the rule's own arithmetic. Normally omitted so the
   * divisor is derived from the rule's, which keeps the exception on the same
   * footing as the rest of the roster.
   */
  commissionDivisor?: number;
};

function parseMemberRate(value: unknown): MemberRate | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;

  const { ratePercent, commissionDivisor } = value as Record<string, unknown>;
  if (typeof ratePercent !== "number" || ratePercent <= 0) return null;

  return {
    ratePercent,
    commissionDivisor:
      typeof commissionDivisor === "number" && commissionDivisor > 0
        ? commissionDivisor
        : undefined,
  };
}

function parseMemberRates(
  value: unknown
): Record<string, MemberRate> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const rates: Record<string, MemberRate> = {};
  for (const [affiliateId, raw] of Object.entries(
    value as Record<string, unknown>
  )) {
    const rate = parseMemberRate(raw);
    if (rate) rates[affiliateId] = rate;
  }

  return Object.keys(rates).length > 0 ? rates : undefined;
}

export function parseDealRuleMetadata(
  metadata: Prisma.JsonValue | null
): DealRuleMetadata {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  const { commissionDivisor, memberRates } = metadata as Record<
    string,
    unknown
  >;
  return {
    commissionDivisor:
      typeof commissionDivisor === "number" && commissionDivisor > 0
        ? commissionDivisor
        : undefined,
    memberRates: parseMemberRates(memberRates),
  };
}

export function getCommissionDivisor(
  rule: Pick<DealRule, "metadata">
): number | null {
  return parseDealRuleMetadata(rule.metadata).commissionDivisor ?? null;
}

export type ResolvedRate = {
  ratePercent: number;
  commissionDivisor: number | null;
  /** True when the rate came from a member exception, not the rule itself. */
  isException: boolean;
};

/**
 * Loose on `ratePercent` so read models that carry the Decimal as a plain
 * string can resolve a rate without rebuilding a DealRule.
 */
type RateSource = {
  ratePercent: unknown;
  metadata: Prisma.JsonValue | null;
};

/**
 * The rate to price one recruit's sales at, which is the rule's rate unless
 * that recruit has a negotiated exception.
 *
 * An exception states a rate, not a divisor. On a rule that prices by divisor
 * the divisor is derived from the rule's own, so the exception inherits the
 * convention behind it rather than restating it: the rule's rate times its
 * divisor is the recruit rate it assumes (10% × 3 = the standard 30%), and
 * dividing that by the new rate gives the divisor that pays it (30 / 12.5 =
 * 2.4). Hand-writing the divisor instead would let the stated rate and the
 * arithmetic drift apart, and the stated rate is what the sponsor was promised.
 */
export function resolveRateForMember(
  rule: RateSource,
  sourceAffiliateId?: string | null
): ResolvedRate {
  const metadata = parseDealRuleMetadata(rule.metadata);
  const ruleRate = toNumber(rule.ratePercent);
  const ruleDivisor = metadata.commissionDivisor ?? null;

  const exception = sourceAffiliateId
    ? metadata.memberRates?.[sourceAffiliateId]
    : undefined;

  if (!exception) {
    return {
      ratePercent: ruleRate,
      commissionDivisor: ruleDivisor,
      isException: false,
    };
  }

  if (exception.commissionDivisor) {
    return {
      ratePercent: exception.ratePercent,
      commissionDivisor: exception.commissionDivisor,
      isException: true,
    };
  }

  return {
    ratePercent: exception.ratePercent,
    commissionDivisor:
      ruleDivisor && ruleRate > 0
        ? (ruleDivisor * ruleRate) / exception.ratePercent
        : null,
    isException: true,
  };
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
  commission: Pick<Commission, "amount" | "orderRevenue" | "commissionBase">,
  sourceAffiliateId?: string | null
): number {
  const { ratePercent, commissionDivisor } = resolveRateForMember(
    rule,
    sourceAffiliateId
  );
  const rate = ratePercent / 100;

  switch (rule.basis) {
    case DealBasis.ORDER_REVENUE:
      return roundCurrency(
        toNumber(commission.commissionBase ?? commission.orderRevenue) * rate
      );
    case DealBasis.RECRUIT_COMMISSION:
      if (commissionDivisor) {
        return roundCurrency(toNumber(commission.amount) / commissionDivisor);
      }
      return roundCurrency(toNumber(commission.amount) * rate);
    case DealBasis.FIXED:
      return roundCurrency(ratePercent);
    default:
      return 0;
  }
}

/** Stable key for grouping payout math labels. */
export function payoutMathTerm(
  rule: Pick<DealRule, "ratePercent" | "basis" | "metadata"> | null,
  sourceAffiliateId?: string | null
): string | null {
  if (!rule) return null;
  const { ratePercent, commissionDivisor } = resolveRateForMember(
    rule,
    sourceAffiliateId
  );
  if (commissionDivisor) return `divisor:${commissionDivisor}|${rule.basis}`;
  return `${ratePercent}|${rule.basis}`;
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
  rule: Pick<DealRule, "ratePercent" | "basis" | "metadata"> | null,
  sourceAffiliateId?: string | null
): string | null {
  if (!rule) return null;
  const { ratePercent, commissionDivisor } = resolveRateForMember(
    rule,
    sourceAffiliateId
  );
  // TEAM_DEAL marks rules priced from the recruit's commission (Gavin's
  // spreadsheet) so the payout line never reads as "sales × 10%" — that
  // multiplication only checks out when every sale pays the recruit 30%.
  if (commissionDivisor) {
    return `${ratePercent}|TEAM_DEAL`;
  }
  return payoutMathTerm(rule, sourceAffiliateId);
}
