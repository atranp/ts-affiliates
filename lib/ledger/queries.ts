import {
  CommissionStatus,
  LedgerEntryType,
  Prisma,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { getMilestoneProgress } from "@/lib/milestone";
import type { LedgerSummary } from "@/lib/rules-engine";
import { toNumber } from "@/lib/utils";

export type TeamBonusSummary = {
  sourceAffiliateId: string;
  displayName: string | null;
  email: string;
  unpaidTotal: number;
  unpaidCount: number;
  paidTotal: number;
  paidCount: number;
  pendingTotal: number;
  pendingCount: number;
  milestone: {
    current: number;
    threshold: number;
    met: boolean;
    remaining: number;
  } | null;
};

export type LedgerFilters = {
  affiliateId: string;
  status?: CommissionStatus;
  type?: LedgerEntryType;
  sourceAffiliateId?: string;
  teamId?: string;
  q?: string;
  page?: number;
  limit?: number;
};

const DEFAULT_LIMIT = 50;

type LedgerGroupRow = {
  type: LedgerEntryType;
  status: CommissionStatus;
  sourceAffiliateId: string | null;
  _sum: { amount: Prisma.Decimal | null };
  _count: { _all: number };
};

function buildWhere(filters: LedgerFilters): Prisma.LedgerEntryWhereInput {
  const where: Prisma.LedgerEntryWhereInput = {
    affiliateId: filters.affiliateId,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.sourceAffiliateId
      ? { sourceAffiliateId: filters.sourceAffiliateId }
      : {}),
    ...(filters.teamId ? { dealRule: { teamId: filters.teamId } } : {}),
  };

  if (filters.q) {
    const qNum = Number(filters.q);
    if (!Number.isNaN(qNum) && qNum > 0) {
      where.wooOrderId = qNum;
    } else {
      where.description = { contains: filters.q, mode: "insensitive" };
    }
  }

  return where;
}

function matchesLedgerFilters(
  row: Pick<LedgerGroupRow, "type" | "status" | "sourceAffiliateId">,
  filters?: {
    type?: LedgerEntryType;
    status?: CommissionStatus;
    sourceAffiliateId?: string;
  }
) {
  if (filters?.type && row.type !== filters.type) return false;
  if (filters?.status && row.status !== filters.status) return false;
  if (
    filters?.sourceAffiliateId &&
    row.sourceAffiliateId !== filters.sourceAffiliateId
  ) {
    return false;
  }
  return true;
}

function summaryFromGroups(
  groups: LedgerGroupRow[],
  filters?: {
    type?: LedgerEntryType;
    status?: CommissionStatus;
    sourceAffiliateId?: string;
  }
): LedgerSummary {
  const summary: LedgerSummary = {
    unpaidTotal: 0,
    paidTotal: 0,
    pendingTotal: 0,
    unpaidCount: 0,
    paidCount: 0,
  };

  for (const row of groups) {
    if (!matchesLedgerFilters(row, filters)) continue;

    const amount = toNumber(row._sum.amount);
    const count = row._count._all;
    if (row.status === CommissionStatus.PAID) {
      summary.paidTotal += amount;
      summary.paidCount += count;
    } else if (row.status === CommissionStatus.UNPAID) {
      summary.unpaidTotal += amount;
      summary.unpaidCount += count;
    } else if (row.status === CommissionStatus.PENDING) {
      summary.pendingTotal += amount;
    }
  }

  return summary;
}

function teamBonusesFromGroups(
  groups: LedgerGroupRow[],
  affiliateById: Map<
    string,
    { id: string; email: string; displayName: string | null }
  >
): TeamBonusSummary[] {
  const bySource = new Map<string, TeamBonusSummary>();

  for (const row of groups) {
    if (row.type !== LedgerEntryType.OVERRIDE || !row.sourceAffiliateId) continue;

    const affiliate = affiliateById.get(row.sourceAffiliateId);
    if (!affiliate) continue;

    const existing = bySource.get(row.sourceAffiliateId) ?? {
      sourceAffiliateId: row.sourceAffiliateId,
      displayName: affiliate.displayName,
      email: affiliate.email,
      unpaidTotal: 0,
      unpaidCount: 0,
      paidTotal: 0,
      paidCount: 0,
      pendingTotal: 0,
      pendingCount: 0,
      milestone: null,
    };

    const amount = toNumber(row._sum.amount);
    const count = row._count._all;
    if (row.status === CommissionStatus.PAID) {
      existing.paidTotal += amount;
      existing.paidCount += count;
    } else if (row.status === CommissionStatus.UNPAID) {
      existing.unpaidTotal += amount;
      existing.unpaidCount += count;
    } else if (row.status === CommissionStatus.PENDING) {
      existing.pendingTotal += amount;
      existing.pendingCount += count;
    }

    bySource.set(row.sourceAffiliateId, existing);
  }

  return Array.from(bySource.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );
}

export async function getPaginatedLedgerEntries(filters: LedgerFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const limit = Math.min(100, Math.max(1, filters.limit ?? DEFAULT_LIMIT));
  const where = buildWhere(filters);

  const total = await prisma.ledgerEntry.count({ where });
  const entries = await prisma.ledgerEntry.findMany({
    where,
    include: {
      sourceAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      dealRule: {
        select: { id: true, name: true },
      },
      payoutBatch: {
        select: { id: true, label: true },
      },
    },
    orderBy: { createdAt: "desc" },
    skip: (page - 1) * limit,
    take: limit,
  });

  return {
    entries,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

/** Single-connection-safe: sequential queries, one groupBy for all summaries. */
export async function getLedgerResponse(filters: LedgerFilters) {
  const pageData = await getPaginatedLedgerEntries(filters);

  const groups = await prisma.ledgerEntry.groupBy({
    by: ["type", "status", "sourceAffiliateId"],
    where: { affiliateId: filters.affiliateId },
    _sum: { amount: true },
    _count: { _all: true },
  });

  const summary = summaryFromGroups(groups, {
    type: filters.type,
    status: filters.status,
    sourceAffiliateId: filters.sourceAffiliateId,
  });

  const overrideSummary = summaryFromGroups(groups, {
    type: LedgerEntryType.OVERRIDE,
    sourceAffiliateId: filters.sourceAffiliateId,
  });

  const sourceIds = Array.from(
    new Set(
      groups
        .filter(
          (row) =>
            row.type === LedgerEntryType.OVERRIDE && row.sourceAffiliateId
        )
        .map((row) => row.sourceAffiliateId as string)
    )
  );

  const sourceAffiliates =
    sourceIds.length > 0
      ? await prisma.affiliate.findMany({
          where: { id: { in: sourceIds } },
          select: { id: true, email: true, displayName: true },
        })
      : [];

  const affiliateById = new Map(sourceAffiliates.map((a) => [a.id, a]));
  let teamBonuses = teamBonusesFromGroups(groups, affiliateById);

  if (sourceIds.length > 0) {
    const [dealRules, revenueRows] = [
      await prisma.dealRule.findMany({
        where: {
          sponsorAffiliateId: filters.affiliateId,
          active: true,
          sourceAffiliateId: { in: sourceIds },
        },
        select: {
          sourceAffiliateId: true,
          milestoneRevenueThreshold: true,
        },
      }),
      await prisma.commission.groupBy({
        by: ["affiliateId"],
        where: {
          affiliateId: { in: sourceIds },
          orderRevenue: { not: null },
        },
        _sum: { orderRevenue: true },
      }),
    ];

    const thresholdBySource = new Map(
      dealRules
        .filter((r) => r.sourceAffiliateId)
        .map((r) => [
          r.sourceAffiliateId as string,
          r.milestoneRevenueThreshold
            ? toNumber(r.milestoneRevenueThreshold)
            : null,
        ])
    );
    const revenueBySource = new Map(
      revenueRows.map((row) => [row.affiliateId, toNumber(row._sum.orderRevenue)])
    );

    teamBonuses = teamBonuses.map((bonus) => {
      const revenue = revenueBySource.get(bonus.sourceAffiliateId) ?? 0;
      const threshold = thresholdBySource.get(bonus.sourceAffiliateId) ?? null;
      const progress = getMilestoneProgress(revenue, threshold);
      return {
        ...bonus,
        milestone: progress
          ? {
              current: progress.current,
              threshold: progress.threshold,
              met: progress.met,
              remaining: progress.remaining,
            }
          : null,
      };
    });
  }

  return {
    ...pageData,
    summary,
    overrideSummary,
    teamBonuses,
    sourceAffiliates,
  };
}
