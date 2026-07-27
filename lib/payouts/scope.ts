import { endOfDay, startOfDay } from "date-fns";
import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import type { PayoutScope } from "./types";

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

  const resolvedEnd = endOfDay(periodEnd ?? payoutWeek!);
  const payoutWeekFilter: Prisma.DateTimeNullableFilter = { lte: resolvedEnd };
  if (periodStart) {
    payoutWeekFilter.gte = startOfDay(periodStart);
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

  if (scope === "team" && teamId) {
    return {
      ...base,
      OR: [
        {
          type: LedgerEntryType.OVERRIDE,
          dealRule: { teamId },
        },
        ...(sponsorAffiliateId
          ? [
              {
                type: LedgerEntryType.DIRECT,
                affiliateId: sponsorAffiliateId,
              },
            ]
          : []),
      ],
    };
  }

  if (sponsorAffiliateId) {
    return { ...base, affiliateId: sponsorAffiliateId };
  }

  return base;
}
