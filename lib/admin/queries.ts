import { CommissionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AdminStats, PaginatedAffiliates } from "./types";
import { toNumber } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 25;

export async function getAdminStats(): Promise<AdminStats> {
  const [affiliateGroups, profilesWithAffiliate, ledgerGroups, dealRuleGroups, settings] =
    await Promise.all([
      prisma.affiliate.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
      prisma.profile.count({ where: { affiliateId: { not: null } } }),
      prisma.ledgerEntry.groupBy({
        by: ["status"],
        _sum: { amount: true },
        _count: { _all: true },
      }),
      prisma.dealRule.groupBy({
        by: ["active"],
        _count: { _all: true },
      }),
      prisma.settings.findUnique({ where: { id: "default" } }),
    ]);

  let affiliateTotal = 0;
  let affiliateActive = 0;
  for (const row of affiliateGroups) {
    affiliateTotal += row._count._all;
    if (row.status === "ACTIVE") affiliateActive = row._count._all;
  }

  const ledger = {
    unpaidTotal: 0,
    unpaidCount: 0,
    paidTotal: 0,
    paidCount: 0,
    pendingTotal: 0,
  };

  for (const row of ledgerGroups) {
    const amount = toNumber(row._sum.amount);
    const count = row._count._all;
    if (row.status === CommissionStatus.UNPAID) {
      ledger.unpaidTotal = amount;
      ledger.unpaidCount = count;
    } else if (row.status === CommissionStatus.PAID) {
      ledger.paidTotal = amount;
      ledger.paidCount = count;
    } else if (row.status === CommissionStatus.PENDING) {
      ledger.pendingTotal = amount;
    }
  }

  let dealRuleTotal = 0;
  let dealRuleActive = 0;
  for (const row of dealRuleGroups) {
    dealRuleTotal += row._count._all;
    if (row.active) dealRuleActive = row._count._all;
  }

  return {
    affiliates: {
      total: affiliateTotal,
      active: affiliateActive,
      withPortalAccess: profilesWithAffiliate,
    },
    ledger,
    dealRules: {
      active: dealRuleActive,
      total: dealRuleTotal,
    },
    sync: {
      lastAffiliateSyncAt: settings?.lastAffiliateSyncAt?.toISOString() ?? null,
      lastCommissionSyncAt:
        settings?.lastCommissionSyncAt?.toISOString() ?? null,
      hasWooCommerce:
        !!settings?.wcStoreUrlEncrypted && !!settings?.wcConsumerKeyEncrypted,
      hasSliceWP:
        !!settings?.slicewpConsumerKeyEncrypted &&
        !!settings?.slicewpConsumerSecretEncrypted,
    },
  };
}

export async function getPaginatedAffiliates(params: {
  page?: number;
  pageSize?: number;
  q?: string;
  status?: string;
}): Promise<PaginatedAffiliates> {
  const page = Math.max(1, params.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE));
  const skip = (page - 1) * pageSize;

  const where: Prisma.AffiliateWhereInput = {};

  if (params.status && params.status !== "all") {
    where.status = params.status as Prisma.EnumAffiliateStatusFilter["equals"];
  }

  if (params.q?.trim()) {
    const q = params.q.trim();
    where.OR = [
      { email: { contains: q, mode: "insensitive" } },
      { displayName: { contains: q, mode: "insensitive" } },
      ...(Number.isFinite(Number(q)) ? [{ slicewpId: Number(q) }] : []),
    ];
  }

  const total = await prisma.affiliate.count({ where });

  const affiliates = await prisma.affiliate.findMany({
    where,
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    skip,
    take: pageSize,
    select: {
      id: true,
      slicewpId: true,
      email: true,
      displayName: true,
      status: true,
    },
  });

  const affiliateIds = affiliates.map((a) => a.id);

  const [profiles, unpaidByAffiliate] =
    affiliateIds.length > 0
      ? await Promise.all([
          prisma.profile.findMany({
            where: { affiliateId: { in: affiliateIds } },
            select: { affiliateId: true },
          }),
          prisma.ledgerEntry.groupBy({
            by: ["affiliateId"],
            where: {
              status: CommissionStatus.UNPAID,
              affiliateId: { in: affiliateIds },
            },
            _sum: { amount: true },
          }),
        ])
      : [[], []];

  const linkedIds = new Set(
    profiles.map((p) => p.affiliateId).filter((id): id is string => !!id)
  );
  const unpaidMap = new Map(
    unpaidByAffiliate.map((row) => [
      row.affiliateId,
      toNumber(row._sum.amount),
    ])
  );

  return {
    items: affiliates.map((affiliate) => ({
      ...affiliate,
      hasPortalAccess: linkedIds.has(affiliate.id),
      unpaidTotal: unpaidMap.get(affiliate.id) ?? 0,
    })),
    total,
    page,
    pageSize,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
  };
}
