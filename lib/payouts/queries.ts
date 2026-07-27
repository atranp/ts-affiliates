import { LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import type {
  PayoutBatchDetail,
  PayoutBatchEntry,
  PayoutBatchListItem,
  PayoutRecruitLine,
} from "./types";

function mapEntry(entry: {
  id: string;
  type: LedgerEntryType;
  amount: { toString(): string };
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: { toString(): string } | null;
  createdAt: Date;
  sourceAffiliate: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
  dealRule: { id: string; name: string } | null;
}): PayoutBatchEntry {
  return {
    id: entry.id,
    type: entry.type,
    amount: toNumber(entry.amount),
    status: entry.status,
    description: entry.description,
    wooOrderId: entry.wooOrderId,
    orderRevenue: entry.orderRevenue ? toNumber(entry.orderRevenue) : null,
    createdAt: entry.createdAt.toISOString(),
    sourceAffiliate: entry.sourceAffiliate,
    dealRule: entry.dealRule,
  };
}

function recruitBreakdownFromEntries(
  entries: Array<{
    type: LedgerEntryType;
    amount: { toString(): string };
    sourceAffiliate: {
      id: string;
      displayName: string | null;
      email: string;
    } | null;
  }>
): PayoutRecruitLine[] {
  const map = new Map<string, PayoutRecruitLine>();

  for (const entry of entries) {
    if (entry.type !== LedgerEntryType.OVERRIDE || !entry.sourceAffiliate) continue;
    const id = entry.sourceAffiliate.id;
    const current = map.get(id) ?? {
      sourceAffiliateId: id,
      displayName: entry.sourceAffiliate.displayName,
      email: entry.sourceAffiliate.email,
      overrideTotal: 0,
      overrideCount: 0,
    };
    current.overrideTotal += toNumber(entry.amount);
    current.overrideCount += 1;
    map.set(id, current);
  }

  return Array.from(map.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );
}

export async function getPayoutBatchDetail(
  batchId: string,
  options?: { affiliateId?: string }
): Promise<PayoutBatchDetail | null> {
  const batch = await prisma.payoutBatch.findUnique({
    where: { id: batchId },
    include: {
      team: { select: { id: true, name: true } },
      items: {
        include: {
          affiliate: {
            select: { id: true, displayName: true, email: true },
          },
        },
      },
      ledgerEntries: {
        where: options?.affiliateId
          ? { affiliateId: options.affiliateId }
          : undefined,
        include: {
          sourceAffiliate: {
            select: { id: true, displayName: true, email: true },
          },
          dealRule: { select: { id: true, name: true } },
        },
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!batch) return null;

  if (options?.affiliateId) {
    const ownsBatch = batch.items.some(
      (item) => item.affiliateId === options.affiliateId
    );
    if (!ownsBatch) return null;
  }

  const entries = batch.ledgerEntries.map(mapEntry);
  let directTotal = 0;
  let overrideTotal = 0;

  for (const entry of entries) {
    if (entry.type === LedgerEntryType.DIRECT) directTotal += entry.amount;
    else if (entry.type === LedgerEntryType.OVERRIDE) overrideTotal += entry.amount;
  }

  const itemAffiliateIds = options?.affiliateId
    ? batch.items.filter((item) => item.affiliateId === options.affiliateId)
    : batch.items;

  const items = itemAffiliateIds.map((item) => {
    const itemEntries = batch.ledgerEntries.filter(
      (le) => le.affiliateId === item.affiliateId
    );
    let itemDirect = 0;
    let itemOverride = 0;
    for (const entry of itemEntries) {
      const amount = toNumber(entry.amount);
      if (entry.type === LedgerEntryType.DIRECT) itemDirect += amount;
      else if (entry.type === LedgerEntryType.OVERRIDE) itemOverride += amount;
    }
    return {
      affiliateId: item.affiliateId,
      displayName: item.affiliate.displayName,
      email: item.affiliate.email,
      totalAmount: toNumber(item.totalAmount),
      entryCount: item.entryCount,
      directTotal: itemDirect,
      overrideTotal: itemOverride,
    };
  });

  return {
    id: batch.id,
    label: batch.label,
    status: batch.status,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    processedAt: batch.processedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    teamId: batch.teamId,
    teamName: batch.team?.name ?? null,
    sponsorAffiliateId: batch.sponsorAffiliateId,
    totals: {
      grandTotal: directTotal + overrideTotal,
      directTotal,
      overrideTotal,
      entryCount: entries.length,
    },
    items,
    recruitBreakdown: recruitBreakdownFromEntries(batch.ledgerEntries),
    entries,
  };
}

export async function listPayoutBatchesForSponsor(
  sponsorAffiliateId: string,
  limit = 20
): Promise<PayoutBatchListItem[]> {
  const batches = await prisma.payoutBatch.findMany({
    where: { sponsorAffiliateId },
    orderBy: [{ processedAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: {
      team: { select: { id: true, name: true } },
      items: true,
      _count: { select: { ledgerEntries: true } },
    },
  });

  return batches.map((batch) => ({
    id: batch.id,
    label: batch.label,
    status: batch.status,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    processedAt: batch.processedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    teamId: batch.teamId,
    teamName: batch.team?.name ?? null,
    sponsorAffiliateId: batch.sponsorAffiliateId,
    entryCount: batch._count.ledgerEntries,
    affiliateCount: batch.items.length,
    totalAmount: batch.items.reduce(
      (sum, item) => sum + toNumber(item.totalAmount),
      0
    ),
  }));
}

export async function listPayoutBatchesForAffiliate(
  affiliateId: string,
  limit = 20
): Promise<PayoutBatchListItem[]> {
  const batches = await prisma.payoutBatch.findMany({
    where: { items: { some: { affiliateId } } },
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      team: { select: { id: true, name: true } },
      items: { where: { affiliateId } },
      _count: { select: { ledgerEntries: true } },
    },
  });

  return batches.map((batch) => ({
    id: batch.id,
    label: batch.label,
    status: batch.status,
    periodStart: batch.periodStart.toISOString(),
    periodEnd: batch.periodEnd.toISOString(),
    processedAt: batch.processedAt?.toISOString() ?? null,
    createdAt: batch.createdAt.toISOString(),
    teamId: batch.teamId,
    teamName: batch.team?.name ?? null,
    sponsorAffiliateId: batch.sponsorAffiliateId,
    entryCount: batch.items[0]?.entryCount ?? 0,
    affiliateCount: 1,
    totalAmount: batch.items.reduce(
      (sum, item) => sum + toNumber(item.totalAmount),
      0
    ),
  }));
}

export async function getDirectUnpaidTotal(
  affiliateId: string,
  payoutWeek: Date
) {
  const result = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId,
      type: LedgerEntryType.DIRECT,
      status: "UNPAID",
      payoutWeek: { lte: payoutWeek },
    },
    _sum: { amount: true },
    _count: { _all: true },
  });

  return {
    total: toNumber(result._sum.amount),
    count: result._count._all,
  };
}
