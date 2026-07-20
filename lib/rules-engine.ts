import {
  Commission,
  CommissionStatus,
  DealBasis,
  DealRule,
  LedgerEntryType,
  PayoutSchedule,
  Prisma,
} from "@prisma/client";
import { prisma } from "./prisma";
import {
  getMilestoneProgress,
  getRecruitCumulativeRevenue,
  milestoneDescriptionSuffix,
  overrideStatusForMilestone,
  promoteMilestoneOverrides,
} from "./milestone";
import { getNextPayoutWeek } from "./payout-schedule";
import { toNumber } from "./utils";

export async function processDealRulesForCommission(
  commission: Commission,
  revenueByRecruit?: Map<string, number>
) {
  const rules = await prisma.dealRule.findMany({
    where: {
      active: true,
      sourceAffiliateId: commission.affiliateId,
    },
  });

  for (const rule of rules) {
    await createOverrideEntry(rule, commission, revenueByRecruit);
  }
}

function buildOverrideEntryData(
  rule: DealRule,
  commission: Pick<
    Commission,
    "id" | "amount" | "orderRevenue" | "status" | "wooOrderId" | "affiliateId"
  >,
  sourceName: string,
  cumulativeRevenue: number
) {
  const amount = calculateOverrideAmount(rule, commission as Commission);
  if (amount <= 0) return null;

  const threshold = rule.milestoneRevenueThreshold
    ? toNumber(rule.milestoneRevenueThreshold)
    : null;
  const progress = getMilestoneProgress(cumulativeRevenue, threshold);
  const status = overrideStatusForMilestone(
    commission.status,
    cumulativeRevenue,
    threshold
  );

  const rate = toNumber(rule.ratePercent);
  const revenue = toNumber(commission.orderRevenue);
  const orderLabel = commission.wooOrderId
    ? `Order #${commission.wooOrderId}`
    : "commission";

  const baseDescription =
    rule.basis === DealBasis.ORDER_REVENUE
      ? `${rate}% team bonus from ${sourceName} · ${orderLabel} · $${revenue.toLocaleString("en-US", { minimumFractionDigits: 2 })} revenue`
      : `${rate}% team bonus from ${sourceName} · ${orderLabel}`;

  return {
    affiliateId: rule.sponsorAffiliateId,
    type: LedgerEntryType.OVERRIDE,
    amount,
    status,
    description: `${baseDescription}${milestoneDescriptionSuffix(progress)}`,
    wooOrderId: commission.wooOrderId,
    orderRevenue: commission.orderRevenue,
    sourceAffiliateId: rule.sourceAffiliateId,
    sourceCommissionId: commission.id,
    dealRuleId: rule.id,
    payoutWeek: getNextPayoutWeek(rule.schedule),
  };
}

async function createOverrideEntry(
  rule: DealRule,
  commission: Commission,
  revenueByRecruit?: Map<string, number>
) {
  if (!rule.sourceAffiliateId) return false;

  const cumulativeRevenue =
    revenueByRecruit?.get(rule.sourceAffiliateId) ??
    (await getRecruitCumulativeRevenue(rule.sourceAffiliateId));

  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      dealRuleId: rule.id,
      sourceCommissionId: commission.id,
      type: LedgerEntryType.OVERRIDE,
    },
  });

  const sourceAffiliate = await prisma.affiliate.findUnique({
    where: { id: rule.sourceAffiliateId },
    select: { displayName: true, email: true },
  });

  const sourceName =
    sourceAffiliate?.displayName ?? sourceAffiliate?.email ?? "recruit";

  const data = buildOverrideEntryData(
    rule,
    commission,
    sourceName,
    cumulativeRevenue
  );
  if (!data) return false;

  if (existing) {
    await prisma.ledgerEntry.update({
      where: { id: existing.id },
      data: {
        amount: data.amount,
        status: data.status,
        description: data.description,
        orderRevenue: data.orderRevenue,
        wooOrderId: data.wooOrderId,
      },
    });
  } else {
    await prisma.ledgerEntry.create({ data });
  }

  const threshold = rule.milestoneRevenueThreshold
    ? toNumber(rule.milestoneRevenueThreshold)
    : null;
  if (threshold && threshold > 0) {
    await promoteMilestoneOverrides(
      rule.id,
      rule.sourceAffiliateId,
      threshold,
      cumulativeRevenue
    );
  }

  return !existing;
}

/** Apply a deal rule to all existing commissions from the recruit (source) affiliate. */
export async function applyDealRuleRetroactively(
  ruleId: string
): Promise<number> {
  const rule = await prisma.dealRule.findUnique({
    where: { id: ruleId },
    include: {
      sourceAffiliate: {
        select: { displayName: true, email: true },
      },
    },
  });

  if (!rule || !rule.active || !rule.sourceAffiliateId) {
    return 0;
  }

  const cumulativeRevenue = await getRecruitCumulativeRevenue(
    rule.sourceAffiliateId
  );

  const commissions = await prisma.commission.findMany({
    where: { affiliateId: rule.sourceAffiliateId },
    select: {
      id: true,
      amount: true,
      orderRevenue: true,
      status: true,
      wooOrderId: true,
      affiliateId: true,
    },
    orderBy: { dateCreated: "asc" },
  });

  const existingOverrides = await prisma.ledgerEntry.findMany({
    where: {
      dealRuleId: ruleId,
      type: LedgerEntryType.OVERRIDE,
    },
    select: { sourceCommissionId: true },
  });

  const existingIds = new Set(
    existingOverrides
      .map((entry) => entry.sourceCommissionId)
      .filter((id): id is string => !!id)
  );

  const revenueMap = new Map([[rule.sourceAffiliateId, cumulativeRevenue]]);

  let created = 0;
  for (const commission of commissions) {
    if (existingIds.has(commission.id)) {
      await createOverrideEntry(
        rule,
        commission as Commission,
        revenueMap
      );
      continue;
    }
    const didCreate = await createOverrideEntry(
      rule,
      commission as Commission,
      revenueMap
    );
    if (didCreate) created += 1;
  }

  const threshold = rule.milestoneRevenueThreshold
    ? toNumber(rule.milestoneRevenueThreshold)
    : null;
  if (threshold && threshold > 0) {
    await promoteMilestoneOverrides(
      rule.id,
      rule.sourceAffiliateId,
      threshold,
      cumulativeRevenue
    );
  }

  return created;
}

/** Remove unpaid team bonus lines tied to a rule (keeps paid history). */
export async function deleteNonPaidOverridesForRule(
  ruleId: string
): Promise<number> {
  const result = await prisma.ledgerEntry.deleteMany({
    where: {
      dealRuleId: ruleId,
      type: LedgerEntryType.OVERRIDE,
      status: {
        in: [CommissionStatus.PENDING, CommissionStatus.UNPAID],
      },
    },
  });
  return result.count;
}

function calculateOverrideAmount(rule: DealRule, commission: Commission): number {
  const rate = toNumber(rule.ratePercent) / 100;

  switch (rule.basis) {
    case DealBasis.ORDER_REVENUE:
      return toNumber(commission.orderRevenue) * rate;
    case DealBasis.RECRUIT_COMMISSION:
      return toNumber(commission.amount) * rate;
    case DealBasis.FIXED:
      return toNumber(rule.ratePercent);
    default:
      return 0;
  }
}

export async function ensureDirectLedgerEntry(commission: Commission) {
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      affiliateId: commission.affiliateId,
      type: LedgerEntryType.DIRECT,
      slicewpCommissionId: commission.slicewpId,
    },
  });

  if (existing) {
    await prisma.ledgerEntry.update({
      where: { id: existing.id },
      data: {
        amount: commission.amount,
        status: commission.status,
        orderRevenue: commission.orderRevenue,
        wooOrderId: commission.wooOrderId,
      },
    });
    return;
  }

  await prisma.ledgerEntry.create({
    data: {
      affiliateId: commission.affiliateId,
      type: LedgerEntryType.DIRECT,
      amount: commission.amount,
      status: commission.status,
      description: commission.wooOrderId
        ? `Commission for order #${commission.wooOrderId}`
        : "Direct commission",
      wooOrderId: commission.wooOrderId,
      orderRevenue: commission.orderRevenue,
      sourceCommissionId: commission.id,
      slicewpCommissionId: commission.slicewpId,
      payoutWeek: getNextPayoutWeek(PayoutSchedule.WEEKLY_MONDAY),
    },
  });
}

export type LedgerSummary = {
  unpaidTotal: number;
  paidTotal: number;
  pendingTotal: number;
  unpaidCount: number;
  paidCount: number;
};

export async function getLedgerSummary(
  affiliateId: string,
  filters?: {
    type?: LedgerEntryType;
    sourceAffiliateId?: string;
  }
): Promise<LedgerSummary> {
  const where: Prisma.LedgerEntryWhereInput = {
    affiliateId,
    ...(filters?.type ? { type: filters.type } : {}),
    ...(filters?.sourceAffiliateId
      ? { sourceAffiliateId: filters.sourceAffiliateId }
      : {}),
  };

  const groups = await prisma.ledgerEntry.groupBy({
    by: ["status"],
    where,
    _sum: { amount: true },
    _count: { _all: true },
  });

  const summary: LedgerSummary = {
    unpaidTotal: 0,
    paidTotal: 0,
    pendingTotal: 0,
    unpaidCount: 0,
    paidCount: 0,
  };

  for (const row of groups) {
    const amount = toNumber(row._sum.amount);
    const count = row._count._all;
    if (row.status === CommissionStatus.PAID) {
      summary.paidTotal = amount;
      summary.paidCount = count;
    } else if (row.status === CommissionStatus.UNPAID) {
      summary.unpaidTotal = amount;
      summary.unpaidCount = count;
    } else if (row.status === CommissionStatus.PENDING) {
      summary.pendingTotal = amount;
    }
  }

  return summary;
}
