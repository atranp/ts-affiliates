import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";

/**
 * The promotional side of an affiliate's account: their link, their coupons,
 * the creatives they can use, and the clicks those produce.
 *
 * Every read here is scoped to one affiliate id supplied by the caller, which
 * comes from the session rather than the request body. Mirrored from SliceWP by
 * M4, so all of it is read-only.
 */

export type AffiliateLink = {
  referralUrl: string | null;
  customSlug: string | null;
  storeCreditBalance: number | null;
};

export async function getAffiliateLink(
  affiliateId: string
): Promise<AffiliateLink> {
  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: {
      referralUrl: true,
      customSlug: true,
      storeCreditBalance: true,
    },
  });

  return {
    referralUrl: affiliate?.referralUrl ?? null,
    customSlug: affiliate?.customSlug ?? null,
    storeCreditBalance:
      affiliate?.storeCreditBalance === null ||
      affiliate?.storeCreditBalance === undefined
        ? null
        : toNumber(affiliate.storeCreditBalance),
  };
}

export type VisitStats = {
  total: number;
  last7Days: number;
  last30Days: number;
  converted: number;
  /** Percent of clicks that earned a commission; null when there is no traffic. */
  conversionRate: number | null;
  lastVisitAt: string | null;
};

export type VisitRow = {
  id: string;
  landingUrl: string | null;
  referrerUrl: string | null;
  converted: boolean;
  occurredAt: string;
};

export type AffiliateVisits = {
  stats: VisitStats;
  /** Most recent first. */
  recent: VisitRow[];
  /** Clicks per day over the requested window, oldest first. */
  daily: Array<{ date: string; visits: number; converted: number }>;
  total: number;
  page: number;
  pageSize: number;
};

const DEFAULT_VISIT_PAGE_SIZE = 50;
const TREND_DAYS = 30;

function daysAgo(days: number): Date {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

export async function getAffiliateVisits(
  affiliateId: string,
  options: { page?: number; pageSize?: number } = {}
): Promise<AffiliateVisits> {
  const pageSize = Math.min(
    Math.max(options.pageSize ?? DEFAULT_VISIT_PAGE_SIZE, 1),
    200
  );
  const page = Math.max(options.page ?? 1, 1);

  const where = { affiliateId };

  const [total, last7, last30, converted, lastVisit, recent, daily] =
    await Promise.all([
      prisma.visit.count({ where }),
      prisma.visit.count({
        where: { ...where, occurredAt: { gte: daysAgo(7) } },
      }),
      prisma.visit.count({
        where: { ...where, occurredAt: { gte: daysAgo(TREND_DAYS) } },
      }),
      prisma.visit.count({
        where: { ...where, slicewpCommissionId: { not: null } },
      }),
      prisma.visit.findFirst({
        where,
        orderBy: { occurredAt: "desc" },
        select: { occurredAt: true },
      }),
      prisma.visit.findMany({
        where,
        orderBy: { occurredAt: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          landingUrl: true,
          referrerUrl: true,
          slicewpCommissionId: true,
          occurredAt: true,
        },
      }),
      dailyVisitCounts(affiliateId),
    ]);

  return {
    stats: {
      total,
      last7Days: last7,
      last30Days: last30,
      converted,
      conversionRate: total > 0 ? (converted / total) * 100 : null,
      lastVisitAt: lastVisit?.occurredAt.toISOString() ?? null,
    },
    recent: recent.map((visit) => ({
      id: visit.id,
      landingUrl: visit.landingUrl,
      referrerUrl: visit.referrerUrl,
      converted: visit.slicewpCommissionId !== null,
      occurredAt: visit.occurredAt.toISOString(),
    })),
    daily,
    total,
    page,
    pageSize,
  };
}

/**
 * Grouped in SQL rather than by pulling rows into memory: a busy affiliate has
 * tens of thousands of visits, and the chart only needs one number per day.
 */
async function dailyVisitCounts(
  affiliateId: string
): Promise<Array<{ date: string; visits: number; converted: number }>> {
  const rows = await prisma.$queryRaw<
    Array<{ day: Date; visits: bigint; converted: bigint }>
  >`
    SELECT date_trunc('day', "occurredAt") AS day,
           COUNT(*)::bigint AS visits,
           COUNT("slicewpCommissionId")::bigint AS converted
    FROM "Visit"
    WHERE "affiliateId" = ${affiliateId}
      AND "occurredAt" >= ${daysAgo(TREND_DAYS)}
    GROUP BY day
    ORDER BY day ASC
  `;

  return rows.map((row) => ({
    date: row.day.toISOString().slice(0, 10),
    visits: Number(row.visits),
    converted: Number(row.converted),
  }));
}

export type AffiliateCouponRow = {
  id: string;
  origin: string;
  code: string;
  amount: string | null;
  uses: Record<string, number> | null;
  totalUses: number;
};

export async function getAffiliateCoupons(
  affiliateId: string
): Promise<AffiliateCouponRow[]> {
  const coupons = await prisma.affiliateCoupon.findMany({
    where: { affiliateId },
    orderBy: { code: "asc" },
    select: { id: true, origin: true, code: true, amount: true, uses: true },
  });

  return coupons.map((coupon) => {
    const uses = (coupon.uses as Record<string, number> | null) ?? null;

    return {
      id: coupon.id,
      origin: coupon.origin,
      code: coupon.code,
      amount: coupon.amount,
      uses,
      totalUses: uses
        ? Object.values(uses).reduce((sum, count) => sum + (count || 0), 0)
        : 0,
    };
  });
}

export type CreativeRow = {
  id: string;
  name: string;
  description: string | null;
  type: string;
  imageUrl: string | null;
  altText: string | null;
  text: string | null;
  landingUrl: string | null;
};

/**
 * Creatives are store-wide, not per-affiliate, so this takes no affiliate id.
 * Only active ones — an inactive creative is one an admin has pulled, and the
 * WordPress portal hides it too.
 */
export async function getActiveCreatives(): Promise<CreativeRow[]> {
  const creatives = await prisma.creative.findMany({
    where: { status: "active" },
    orderBy: { dateCreated: "desc" },
    select: {
      id: true,
      name: true,
      description: true,
      type: true,
      imageUrl: true,
      altText: true,
      text: true,
      landingUrl: true,
    },
  });

  return creatives;
}
