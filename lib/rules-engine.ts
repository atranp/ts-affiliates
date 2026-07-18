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
import { getNextPayoutWeek } from "./payout-schedule";
import { toNumber } from "./utils";

export async function processDealRulesForCommission(commission: Commission) {
  const rules = await prisma.dealRule.findMany({
    where: {
      active: true,
      sourceAffiliateId: commission.affiliateId,
    },
    include: {
      sponsorAffiliate: true,
      sourceAffiliate: true,
    },
  });

  for (const rule of rules) {
    await createOverrideEntry(rule, commission);
  }
}

async function createOverrideEntry(rule: DealRule, commission: Commission) {
  const existing = await prisma.ledgerEntry.findFirst({
    where: {
      dealRuleId: rule.id,
      sourceCommissionId: commission.id,
      type: LedgerEntryType.OVERRIDE,
    },
  });

  if (existing) return;

  const amount = calculateOverrideAmount(rule, commission);
  if (amount <= 0) return;

  const sourceAffiliate = rule.sourceAffiliateId
    ? await prisma.affiliate.findUnique({
        where: { id: rule.sourceAffiliateId },
      })
    : null;

  const description = sourceAffiliate
    ? `Override from ${sourceAffiliate.displayName ?? sourceAffiliate.email}`
    : "Team override";

  await prisma.ledgerEntry.create({
    data: {
      affiliateId: rule.sponsorAffiliateId,
      type: LedgerEntryType.OVERRIDE,
      amount,
      status: mapCommissionStatusToLedger(commission.status),
      description,
      wooOrderId: commission.wooOrderId,
      orderRevenue: commission.orderRevenue,
      sourceAffiliateId: rule.sourceAffiliateId,
      sourceCommissionId: commission.id,
      dealRuleId: rule.id,
      payoutWeek: getNextPayoutWeek(rule.schedule),
    },
  });
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

function mapCommissionStatusToLedger(
  status: CommissionStatus
): CommissionStatus {
  if (status === CommissionStatus.PAID) return CommissionStatus.PAID;
  if (status === CommissionStatus.REJECTED) return CommissionStatus.REJECTED;
  if (status === CommissionStatus.PENDING) return CommissionStatus.PENDING;
  return CommissionStatus.UNPAID;
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

  const entries = await prisma.ledgerEntry.findMany({ where });

  return entries.reduce<LedgerSummary>(
    (acc, entry) => {
      const amount = toNumber(entry.amount);
      if (entry.status === "PAID") {
        acc.paidTotal += amount;
        acc.paidCount += 1;
      } else if (entry.status === "PENDING") {
        acc.pendingTotal += amount;
      } else if (entry.status === "UNPAID") {
        acc.unpaidTotal += amount;
        acc.unpaidCount += 1;
      }
      return acc;
    },
    {
      unpaidTotal: 0,
      paidTotal: 0,
      pendingTotal: 0,
      unpaidCount: 0,
      paidCount: 0,
    }
  );
}
