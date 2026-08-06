import { CommissionStatus } from "@prisma/client";
import { prisma } from "./prisma";
import { toNumber } from "./utils";

export type MilestoneProgress = {
  current: number;
  threshold: number;
  met: boolean;
  remaining: number;
};

/** Sum of order revenue from a recruit's synced commissions. */
export async function getRecruitCumulativeRevenue(
  sourceAffiliateId: string
): Promise<number> {
  const result = await prisma.commission.aggregate({
    where: {
      affiliateId: sourceAffiliateId,
      orderRevenue: { not: null },
    },
    _sum: { orderRevenue: true },
  });
  return toNumber(result._sum.orderRevenue);
}

export function getMilestoneProgress(
  cumulativeRevenue: number,
  threshold: number | null | undefined
): MilestoneProgress | null {
  if (threshold == null || threshold <= 0) return null;

  const current = cumulativeRevenue;
  const met = current >= threshold;
  return {
    current,
    threshold,
    met,
    remaining: met ? 0 : Math.max(0, threshold - current),
  };
}

/** Team bonus status: PENDING until milestone met, then UNPAID until platform payout. */
export function overrideStatusForMilestone(
  sourceCommissionStatus: CommissionStatus,
  cumulativeRevenue: number,
  milestoneThreshold: number | null | undefined
): CommissionStatus {
  const progress = getMilestoneProgress(cumulativeRevenue, milestoneThreshold);
  if (!progress || progress.met) {
    if (sourceCommissionStatus === CommissionStatus.REJECTED) {
      return CommissionStatus.REJECTED;
    }
    return CommissionStatus.UNPAID;
  }
  return CommissionStatus.PENDING;
}

/** Unlock PENDING team bonuses once recruit revenue crosses the milestone. */
export async function promoteMilestoneOverrides(
  dealRuleId: string,
  sourceAffiliateId: string,
  milestoneThreshold: number,
  cumulativeRevenue: number
): Promise<number> {
  if (cumulativeRevenue < milestoneThreshold) return 0;

  const result = await prisma.ledgerEntry.updateMany({
    where: {
      dealRuleId,
      sourceAffiliateId,
      type: "OVERRIDE",
      status: CommissionStatus.PENDING,
    },
    data: {
      status: CommissionStatus.UNPAID,
    },
  });

  return result.count;
}

/**
 * Only says anything while a milestone is still pending, since that explains
 * why the commission isn't payable yet. Once it's met the note is noise.
 */
export function milestoneDescriptionSuffix(
  progress: MilestoneProgress | null
): string {
  if (!progress || progress.met) return "";
  return ` · Milestone ${formatMoney(progress.current)} / ${formatMoney(progress.threshold)}`;
}

function formatMoney(value: number) {
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  });
}
