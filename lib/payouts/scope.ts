import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import type { PayoutScope } from "./types";
import { endOfUtcDay, startOfUtcDay } from "./utc-dates";

export function buildPayoutEntryWhere(options: {
  periodStart?: Date;
  periodEnd: Date;
  /** @deprecated use periodEnd */
  payoutWeek?: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  scope?: PayoutScope;
}): Prisma.LedgerEntryWhereInput {
  const {
    periodStart,
    periodEnd,
    payoutWeek,
    teamId,
    sponsorAffiliateId,
    scope = teamId ? "team" : "all",
  } = options;

  const resolvedEnd = endOfUtcDay(periodEnd ?? payoutWeek!);
  const payoutWeekFilter: Prisma.DateTimeNullableFilter = { lte: resolvedEnd };
  if (periodStart) {
    payoutWeekFilter.gte = startOfUtcDay(periodStart);
  }

  const base = {
    status: CommissionStatus.UNPAID,
    payoutWeek: payoutWeekFilter,
  };

  if (scope === "direct" && sponsorAffiliateId) {
    return {
      ...base,
      affiliateId: sponsorAffiliateId,
      type: LedgerEntryType.DIRECT,
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
