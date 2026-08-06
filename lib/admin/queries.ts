import { CommissionStatus, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type {
  AdminAffiliateDetail,
  AdminStats,
  PaginatedAffiliates,
} from "./types";
import { getLedgerSummary } from "@/lib/rules-engine";
import { toNumber } from "@/lib/utils";

const DEFAULT_PAGE_SIZE = 25;

type StatsRow = {
  affiliate_total: number;
  affiliate_active: number;
  profiles_linked: number;
  unpaid_total: string | null;
  unpaid_count: number;
  paid_total: string | null;
  paid_count: number;
  awaiting_total: string | null;
  awaiting_count: number;
  pending_total: string | null;
  deal_rules_total: number;
  deal_rules_active: number;
  last_affiliate_sync: Date | null;
  last_commission_sync: Date | null;
  has_wc: boolean;
  has_slicewp: boolean;
};

export async function getAdminStats(): Promise<AdminStats> {
  const rows = await prisma.$queryRaw<StatsRow[]>`
    SELECT
      (SELECT COUNT(*)::int FROM "Affiliate") AS affiliate_total,
      (SELECT COUNT(*)::int FROM "Affiliate" WHERE status = 'ACTIVE') AS affiliate_active,
      (SELECT COUNT(*)::int FROM "Profile" WHERE "affiliateId" IS NOT NULL) AS profiles_linked,
      (SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE status = 'UNPAID') AS unpaid_total,
      (SELECT COUNT(*)::int FROM "LedgerEntry" WHERE status = 'UNPAID') AS unpaid_count,
      -- An entry is marked PAID as soon as a payout claims it, so "paid" here
      -- means its payout has also been confirmed as sent.
      (
        SELECT COALESCE(SUM(le.amount), 0)
        FROM "LedgerEntry" le
        LEFT JOIN "PayoutBatch" pb ON pb.id = le."payoutBatchId"
        WHERE le.status = 'PAID' AND (pb.id IS NULL OR pb.status = 'COMPLETED')
      ) AS paid_total,
      (
        SELECT COUNT(*)::int
        FROM "LedgerEntry" le
        LEFT JOIN "PayoutBatch" pb ON pb.id = le."payoutBatchId"
        WHERE le.status = 'PAID' AND (pb.id IS NULL OR pb.status = 'COMPLETED')
      ) AS paid_count,
      (
        SELECT COALESCE(SUM(le.amount), 0)
        FROM "LedgerEntry" le
        JOIN "PayoutBatch" pb ON pb.id = le."payoutBatchId"
        WHERE le.status = 'PAID' AND pb.status <> 'COMPLETED'
      ) AS awaiting_total,
      (
        SELECT COUNT(*)::int
        FROM "LedgerEntry" le
        JOIN "PayoutBatch" pb ON pb.id = le."payoutBatchId"
        WHERE le.status = 'PAID' AND pb.status <> 'COMPLETED'
      ) AS awaiting_count,
      (SELECT COALESCE(SUM(amount), 0) FROM "LedgerEntry" WHERE status = 'PENDING') AS pending_total,
      (SELECT COUNT(*)::int FROM "DealRule") AS deal_rules_total,
      (SELECT COUNT(*)::int FROM "DealRule" WHERE active = true) AS deal_rules_active,
      (SELECT "lastAffiliateSyncAt" FROM "Settings" WHERE id = 'default') AS last_affiliate_sync,
      (SELECT "lastCommissionSyncAt" FROM "Settings" WHERE id = 'default') AS last_commission_sync,
      (
        SELECT ("wcStoreUrlEncrypted" IS NOT NULL AND "wcConsumerKeyEncrypted" IS NOT NULL)
        FROM "Settings" WHERE id = 'default'
      ) AS has_wc,
      (
        SELECT ("slicewpConsumerKeyEncrypted" IS NOT NULL AND "slicewpConsumerSecretEncrypted" IS NOT NULL)
        FROM "Settings" WHERE id = 'default'
      ) AS has_slicewp
  `;

  const row = rows[0] ?? {
    affiliate_total: 0,
    affiliate_active: 0,
    profiles_linked: 0,
    unpaid_total: "0",
    unpaid_count: 0,
    paid_total: "0",
    paid_count: 0,
    awaiting_total: "0",
    awaiting_count: 0,
    pending_total: "0",
    deal_rules_total: 0,
    deal_rules_active: 0,
    last_affiliate_sync: null,
    last_commission_sync: null,
    has_wc: false,
    has_slicewp: false,
  };

  return {
    affiliates: {
      total: row.affiliate_total,
      active: row.affiliate_active,
      withPortalAccess: row.profiles_linked,
    },
    ledger: {
      unpaidTotal: toNumber(row.unpaid_total),
      unpaidCount: row.unpaid_count,
      paidTotal: toNumber(row.paid_total),
      paidCount: row.paid_count,
      awaitingTotal: toNumber(row.awaiting_total),
      awaitingCount: row.awaiting_count,
      pendingTotal: toNumber(row.pending_total),
    },
    dealRules: {
      active: row.deal_rules_active,
      total: row.deal_rules_total,
    },
    sync: {
      lastAffiliateSyncAt: row.last_affiliate_sync?.toISOString() ?? null,
      lastCommissionSyncAt: row.last_commission_sync?.toISOString() ?? null,
      hasWooCommerce: row.has_wc,
      hasSliceWP: row.has_slicewp,
    },
  };
}

export async function searchAffiliates(q: string, limit = 20) {
  const take = Math.min(50, Math.max(1, limit));
  const where: Prisma.AffiliateWhereInput = {};

  const term = q.trim();
  if (term) {
    where.OR = [
      { email: { contains: term, mode: "insensitive" } },
      { displayName: { contains: term, mode: "insensitive" } },
      ...(Number.isFinite(Number(term)) ? [{ slicewpId: Number(term) }] : []),
    ];
  }

  const items = await prisma.affiliate.findMany({
    where,
    orderBy: [{ displayName: "asc" }, { email: "asc" }],
    take,
    select: {
      id: true,
      slicewpId: true,
      email: true,
      displayName: true,
      status: true,
    },
  });

  return { items };
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

  let linkedIds = new Set<string>();
  let unpaidMap = new Map<string, number>();

  if (affiliateIds.length > 0) {
    const profiles = await prisma.profile.findMany({
      where: { affiliateId: { in: affiliateIds } },
      select: { affiliateId: true },
    });
    const unpaidByAffiliate = await prisma.ledgerEntry.groupBy({
      by: ["affiliateId"],
      where: {
        status: CommissionStatus.UNPAID,
        affiliateId: { in: affiliateIds },
      },
      _sum: { amount: true },
    });

    linkedIds = new Set(
      profiles.map((p) => p.affiliateId).filter((id): id is string => !!id)
    );
    unpaidMap = new Map(
      unpaidByAffiliate.map((row) => [
        row.affiliateId,
        toNumber(row._sum.amount),
      ])
    );
  }

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

const dealRuleSelect = {
  id: true,
  name: true,
  type: true,
  ratePercent: true,
  basis: true,
  active: true,
  milestoneRevenueThreshold: true,
  sourceAffiliate: {
    select: { id: true, email: true, displayName: true },
  },
  sponsorAffiliate: {
    select: { id: true, email: true, displayName: true },
  },
} as const;

export async function getAffiliateDetail(
  id: string
): Promise<AdminAffiliateDetail | null> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id },
    include: {
      profile: {
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          mustChangePassword: true,
          portalDisabledAt: true,
          lastSignInAt: true,
        },
      },
    },
  });

  if (!affiliate) return null;

  const ledgerSummary = await getLedgerSummary(id);
  const [overrideAgg, rejectedAgg, pendingAgg, directUnpaid] = await Promise.all([
    prisma.ledgerEntry.aggregate({
      where: { affiliateId: id, type: "OVERRIDE" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { affiliateId: id, status: "REJECTED" },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: { affiliateId: id, status: "PENDING" },
      _count: { _all: true },
    }),
    prisma.ledgerEntry.aggregate({
      where: {
        affiliateId: id,
        type: "DIRECT",
        status: "UNPAID",
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const sponsorRules = await prisma.dealRule.findMany({
    where: { sponsorAffiliateId: id },
    select: dealRuleSelect,
    orderBy: { createdAt: "desc" },
  });
  const recruitRules = await prisma.dealRule.findMany({
    where: { sourceAffiliateId: id },
    select: dealRuleSelect,
    orderBy: { createdAt: "desc" },
  });

  return {
    id: affiliate.id,
    slicewpId: affiliate.slicewpId,
    email: affiliate.email,
    paymentEmail: affiliate.paymentEmail,
    displayName: affiliate.displayName,
    status: affiliate.status,
    commissionRate: affiliate.commissionRate?.toString() ?? null,
    syncedAt: affiliate.syncedAt?.toISOString() ?? null,
    profile: affiliate.profile
      ? {
          ...affiliate.profile,
          portalDisabledAt:
            affiliate.profile.portalDisabledAt?.toISOString() ?? null,
          lastSignInAt: affiliate.profile.lastSignInAt?.toISOString() ?? null,
        }
      : null,
    portal: {
      hasAccess: !!affiliate.profile,
      disabled: !!affiliate.profile?.portalDisabledAt,
      mustChangePassword: affiliate.profile?.mustChangePassword ?? false,
      lastSignInAt: affiliate.profile?.lastSignInAt?.toISOString() ?? null,
      loginEmail: affiliate.profile?.email ?? null,
    },
    ledger: {
      unpaidTotal: ledgerSummary.unpaidTotal,
      unpaidCount: ledgerSummary.unpaidCount,
      paidTotal: ledgerSummary.paidTotal,
      paidCount: ledgerSummary.paidCount,
      pendingTotal: ledgerSummary.pendingTotal,
      pendingCount: pendingAgg._count._all,
      rejectedTotal: toNumber(rejectedAgg._sum.amount),
      rejectedCount: rejectedAgg._count._all,
      directUnpaidTotal: toNumber(directUnpaid._sum.amount),
      directUnpaidCount: directUnpaid._count._all,
      overrideTotal: toNumber(overrideAgg._sum.amount),
      overrideCount: overrideAgg._count._all,
    },
    dealRules: {
      asSponsor: sponsorRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        ratePercent: rule.ratePercent.toString(),
        basis: rule.basis,
        active: rule.active,
        milestoneRevenueThreshold:
          rule.milestoneRevenueThreshold?.toString() ?? null,
        counterparty: rule.sourceAffiliate,
      })),
      asRecruit: recruitRules.map((rule) => ({
        id: rule.id,
        name: rule.name,
        type: rule.type,
        ratePercent: rule.ratePercent.toString(),
        basis: rule.basis,
        active: rule.active,
        milestoneRevenueThreshold:
          rule.milestoneRevenueThreshold?.toString() ?? null,
        counterparty: rule.sponsorAffiliate,
      })),
    },
  };
}
