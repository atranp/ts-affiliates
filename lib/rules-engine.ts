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
import { getTeamMemberIds } from "./teams/members";
import { getNextPayoutWeek } from "./payout-schedule";
import { toNumber } from "./utils";

export async function createSyncDealRuleProcessor() {
  const recruitRulesByAffiliate = new Map<string, DealRule[]>();
  const allRecruitRules = await prisma.dealRule.findMany({
    where: { active: true, sourceAffiliateId: { not: null } },
  });

  for (const rule of allRecruitRules) {
    if (!rule.sourceAffiliateId) continue;
    const existing = recruitRulesByAffiliate.get(rule.sourceAffiliateId) ?? [];
    existing.push(rule);
    recruitRulesByAffiliate.set(rule.sourceAffiliateId, existing);
  }

  const teamRules = await prisma.dealRule.findMany({
    where: {
      active: true,
      sourceAffiliateId: null,
      teamId: { not: null },
    },
  });

  const teamMembersByTeamId = new Map<string, string[]>();
  for (const rule of teamRules) {
    if (!rule.teamId || teamMembersByTeamId.has(rule.teamId)) continue;
    teamMembersByTeamId.set(rule.teamId, await getTeamMemberIds(rule.teamId));
  }

  return {
    teamMemberIds: Array.from(
      new Set(Array.from(teamMembersByTeamId.values()).flat())
    ),
    async process(commission: Commission, revenueByRecruit?: Map<string, number>) {
      const recruitRules =
        recruitRulesByAffiliate.get(commission.affiliateId) ?? [];
      for (const rule of recruitRules) {
        await createOverrideEntry(rule, commission, revenueByRecruit);
      }

      for (const rule of teamRules) {
        if (commission.affiliateId === rule.sponsorAffiliateId) continue;
        if (!rule.teamId) continue;
        const memberIds = teamMembersByTeamId.get(rule.teamId) ?? [];
        if (!memberIds.includes(commission.affiliateId)) continue;
        await createOverrideEntry(
          rule,
          commission,
          revenueByRecruit,
          commission.affiliateId
        );
      }
    },
  };
}

export async function processDealRulesForCommission(
  commission: Commission,
  revenueByRecruit?: Map<string, number>
) {
  const recruitRules = await prisma.dealRule.findMany({
    where: {
      active: true,
      sourceAffiliateId: commission.affiliateId,
    },
  });

  for (const rule of recruitRules) {
    await createOverrideEntry(rule, commission, revenueByRecruit);
  }

  const teamRules = await prisma.dealRule.findMany({
    where: {
      active: true,
      sourceAffiliateId: null,
      teamId: { not: null },
    },
  });

  for (const rule of teamRules) {
    if (commission.affiliateId === rule.sponsorAffiliateId) continue;
    if (!rule.teamId) continue;

    const memberIds = await getTeamMemberIds(rule.teamId);
    if (!memberIds.includes(commission.affiliateId)) continue;

    await createOverrideEntry(
      rule,
      commission,
      revenueByRecruit,
      commission.affiliateId
    );
  }
}

function buildOverrideEntryData(
  rule: DealRule,
  commission: Pick<
    Commission,
    "id" | "amount" | "orderRevenue" | "status" | "wooOrderId" | "affiliateId"
  >,
  sourceName: string,
  cumulativeRevenue: number,
  sourceAffiliateId: string
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
    sourceAffiliateId,
    sourceCommissionId: commission.id,
    dealRuleId: rule.id,
    payoutWeek: getNextPayoutWeek(rule.schedule),
  };
}

function resolveOverrideStatusOnSync(
  existing: {
    status: CommissionStatus;
    payoutBatchId: string | null;
    paidAt: Date | null;
  },
  computed: CommissionStatus
): CommissionStatus {
  if (
    existing.status === CommissionStatus.PAID &&
    (existing.payoutBatchId || existing.paidAt)
  ) {
    return CommissionStatus.PAID;
  }
  return computed;
}

async function createOverrideEntry(
  rule: DealRule,
  commission: Commission,
  revenueByRecruit?: Map<string, number>,
  sourceAffiliateIdOverride?: string
) {
  const sourceAffiliateId =
    sourceAffiliateIdOverride ?? rule.sourceAffiliateId ?? null;
  if (!sourceAffiliateId) return false;

  const cumulativeRevenue =
    revenueByRecruit?.get(sourceAffiliateId) ??
    (await getRecruitCumulativeRevenue(sourceAffiliateId));

  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      dealRuleId: rule.id,
      sourceCommissionId: commission.id,
      type: LedgerEntryType.OVERRIDE,
    },
    select: {
      id: true,
      status: true,
      payoutBatchId: true,
      paidAt: true,
    },
  });

  const sourceAffiliate = await prisma.affiliate.findUnique({
    where: { id: sourceAffiliateId },
    select: { displayName: true, email: true },
  });

  const sourceName =
    sourceAffiliate?.displayName ?? sourceAffiliate?.email ?? "recruit";

  const data = buildOverrideEntryData(
    rule,
    commission,
    sourceName,
    cumulativeRevenue,
    sourceAffiliateId
  );
  if (!data) return false;

  if (existing) {
    const status = resolveOverrideStatusOnSync(existing, data.status);
    await prisma.ledgerEntry.update({
      where: { id: existing.id },
      data: {
        amount: data.amount,
        status,
        description: data.description,
        orderRevenue: data.orderRevenue,
        wooOrderId: data.wooOrderId,
        sourceAffiliateId: data.sourceAffiliateId,
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
      sourceAffiliateId,
      threshold,
      cumulativeRevenue
    );
  }

  return !existing;
}

/** Apply a deal rule to all existing commissions it covers. */
export async function applyDealRuleRetroactively(
  ruleId: string
): Promise<number> {
  const rule = await prisma.dealRule.findUnique({
    where: { id: ruleId },
  });

  if (!rule || !rule.active) return 0;

  if (rule.sourceAffiliateId) {
    return applyRecruitRuleRetroactively(rule);
  }

  if (rule.teamId) {
    return applyTeamRuleRetroactively(rule);
  }

  return 0;
}

async function applyRecruitRuleRetroactively(rule: DealRule) {
  if (!rule.sourceAffiliateId) return 0;

  const cumulativeRevenue = await getRecruitCumulativeRevenue(
    rule.sourceAffiliateId
  );

  const commissions = await prisma.commission.findMany({
    where: { affiliateId: rule.sourceAffiliateId },
    orderBy: { dateCreated: "asc" },
  });

  const revenueMap = new Map([[rule.sourceAffiliateId, cumulativeRevenue]]);
  return applyRuleToCommissions(rule, commissions, revenueMap);
}

async function applyTeamRuleRetroactively(rule: DealRule) {
  if (!rule.teamId) return 0;

  const memberIds = await getTeamMemberIds(rule.teamId);
  if (memberIds.length === 0) return 0;

  const revenueRows = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: {
      affiliateId: { in: memberIds },
      orderRevenue: { not: null },
    },
    _sum: { orderRevenue: true },
  });

  const revenueMap = new Map(
    revenueRows.map((row) => [row.affiliateId, toNumber(row._sum.orderRevenue)])
  );

  const commissions = await prisma.commission.findMany({
    where: { affiliateId: { in: memberIds } },
    orderBy: { dateCreated: "asc" },
  });

  return applyRuleToCommissions(rule, commissions, revenueMap);
}

async function applyRuleToCommissions(
  rule: DealRule,
  commissions: Commission[],
  revenueMap: Map<string, number>
) {
  const existingOverrides = await prisma.ledgerEntry.findMany({
    where: {
      dealRuleId: rule.id,
      type: LedgerEntryType.OVERRIDE,
    },
    select: { sourceCommissionId: true },
  });

  const existingIds = new Set(
    existingOverrides
      .map((entry) => entry.sourceCommissionId)
      .filter((id): id is string => !!id)
  );

  let created = 0;
  for (const commission of commissions) {
    const sourceAffiliateId = rule.sourceAffiliateId ?? commission.affiliateId;

    if (existingIds.has(commission.id)) {
      await createOverrideEntry(rule, commission, revenueMap, sourceAffiliateId);
      continue;
    }

    const didCreate = await createOverrideEntry(
      rule,
      commission,
      revenueMap,
      sourceAffiliateId
    );
    if (didCreate) created += 1;

    const amount = toNumber(commission.orderRevenue);
    if (amount > 0) {
      const current = revenueMap.get(sourceAffiliateId) ?? 0;
      revenueMap.set(sourceAffiliateId, current + amount);
    }
  }

  if (rule.sourceAffiliateId) {
    const threshold = rule.milestoneRevenueThreshold
      ? toNumber(rule.milestoneRevenueThreshold)
      : null;
    if (threshold && threshold > 0) {
      await promoteMilestoneOverrides(
        rule.id,
        rule.sourceAffiliateId,
        threshold,
        revenueMap.get(rule.sourceAffiliateId) ?? 0
      );
    }
  } else if (rule.teamId) {
    const memberIds = await getTeamMemberIds(rule.teamId);
    const threshold = rule.milestoneRevenueThreshold
      ? toNumber(rule.milestoneRevenueThreshold)
      : null;
    if (threshold && threshold > 0) {
      for (const memberId of memberIds) {
        await promoteMilestoneOverrides(
          rule.id,
          memberId,
          threshold,
          revenueMap.get(memberId) ?? 0
        );
      }
    }
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
