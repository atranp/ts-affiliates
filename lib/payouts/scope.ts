import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import type { PayoutScope } from "./types";
import { endOfUtcDay, startOfUtcDay } from "./utc-dates";

/**
 * Periods are always measured against the sale date. Partners reconcile against
 * their own sales reports, so matching on the scheduled payout week instead
 * would put a sale in a period the partner doesn't recognise.
 */
export function buildPayoutEntryWhere(options: {
  periodStart?: Date;
  periodEnd: Date;
  /** @deprecated use periodEnd */
  payoutWeek?: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  sourceAffiliateId?: string;
  scope?: PayoutScope;
}): Prisma.LedgerEntryWhereInput {
  const {
    periodStart,
    periodEnd,
    payoutWeek,
    teamId,
    sponsorAffiliateId,
    sourceAffiliateId,
    scope = sourceAffiliateId ? "recruit" : teamId ? "team" : "all",
  } = options;

  const range: { lte: Date; gte?: Date } = {
    lte: endOfUtcDay(periodEnd ?? payoutWeek!),
  };
  if (periodStart) {
    range.gte = startOfUtcDay(periodStart);
  }

  const base: Prisma.LedgerEntryWhereInput = {
    status: CommissionStatus.UNPAID,
    occurredAt: range,
  };

  if (scope === "direct" && sponsorAffiliateId) {
    return {
      ...base,
      affiliateId: sponsorAffiliateId,
      type: LedgerEntryType.DIRECT,
    };
  }

  // A single recruit's bonuses, so a sponsor can be paid for one partner's
  // sales and reconcile the line items against that partner's own report.
  if (scope === "recruit" && sourceAffiliateId) {
    return {
      ...base,
      type: LedgerEntryType.OVERRIDE,
      sourceAffiliateId,
      ...(sponsorAffiliateId ? { affiliateId: sponsorAffiliateId } : {}),
      ...(teamId ? { dealRule: { teamId } } : {}),
    };
  }

  // A team payout covers that team's bonuses only. The sponsor's personal sales
  // are paid through the "direct" scope, so including them here would file
  // unrelated money under the team's batch and leave the direct payout empty.
  if (scope === "team" && teamId) {
    return {
      ...base,
      type: LedgerEntryType.OVERRIDE,
      dealRule: { teamId },
    };
  }

  if (sponsorAffiliateId) {
    return { ...base, affiliateId: sponsorAffiliateId };
  }

  return base;
}
