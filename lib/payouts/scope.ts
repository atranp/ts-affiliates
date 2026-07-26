import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import type { PayoutScope } from "./types";

export function buildPayoutEntryWhere(options: {
  payoutWeek: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  scope?: PayoutScope;
}): Prisma.LedgerEntryWhereInput {
  const { payoutWeek, teamId, sponsorAffiliateId, scope = teamId ? "team" : "all" } =
    options;

  const base = {
    status: CommissionStatus.UNPAID,
    payoutWeek: { lte: payoutWeek },
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
