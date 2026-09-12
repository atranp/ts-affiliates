/**
 * Headline numbers, trend series and attribution for an affiliate over a date
 * window, plus the same numbers for the preceding window so the UI can show
 * direction rather than a bare figure.
 *
 * Everything here reads rows the sync already writes. Nothing new is tracked.
 *
 * Aggregation happens in SQL rather than by loading rows: a single busy
 * ambassador can take 11k clicks in a month, and the series only needs one
 * number per day. Day-of-week and the totals are folded out of those daily
 * buckets in JS, which keeps this to four queries instead of a dozen.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { APP_TIMEZONE } from "@/lib/timezone";
import { toNumber } from "@/lib/utils";
import type { PeriodRange } from "@/lib/affiliate/period";

export type PerformanceTotals = {
  earnings: number;
  /** Sum of commissionable sale value on direct sales (net of shipping & tax where known). */
  revenue: number;
  clicks: number;
  sales: number;
  /**
   * Share of clicks that led to a sale we can trace back to one. Sales with no
   * recorded click are excluded from the numerator on purpose — counting them
   * against a click that never existed inflates the rate. Null when there were
   * no clicks at all.
   */
  conversionRate: number | null;
};

export type PerformancePoint = {
  /** `YYYY-MM-DD` in store time. */
  date: string;
  earnings: number;
  revenue: number;
  clicks: number;
  sales: number;
};

export type DayOfWeekPoint = {
  /** 1 = Monday, matching the store week. */
  day: number;
  label: string;
  clicks: number;
  sales: number;
};

export type SalesAttribution = {
  /** Sales matched to a recorded click. */
  tracked: number;
  /** Sales with no click on file — a discount code, or a dropped referral. */
  untracked: number;
};

export type AffiliatePerformance = {
  current: PerformanceTotals;
  /** Null when the window is unbounded and there is nothing to compare to. */
  previous: PerformanceTotals | null;
  daily: PerformancePoint[];
  byDayOfWeek: DayOfWeekPoint[];
  attribution: SalesAttribution;
  /** Same split over the previous window, so the tracked count can show movement. */
  previousAttribution: SalesAttribution | null;
};

type LedgerDayRow = {
  day: string;
  earnings: Prisma.Decimal | null;
  revenue: Prisma.Decimal | null;
  sales: bigint;
  tracked: bigint;
};

type VisitDayRow = {
  day: string;
  clicks: bigint;
};

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/**
 * `occurredAt` is a naive column holding UTC instants, so it has to be told it
 * is UTC before it can be moved into store time. Dropping the first cast would
 * silently read every timestamp as store-local and shift the whole series.
 */
const STORE_DAY = Prisma.sql`
  to_char(
    date_trunc('day', "occurredAt" AT TIME ZONE 'UTC' AT TIME ZONE ${APP_TIMEZONE}),
    'YYYY-MM-DD'
  )
`;

function rangeClause(range: PeriodRange | null): Prisma.Sql {
  return range
    ? Prisma.sql`AND "occurredAt" >= ${range.from} AND "occurredAt" < ${range.to}`
    : Prisma.empty;
}

/**
 * Earnings, sale count and how many of those sales trace back to a click,
 * bucketed by store day.
 *
 * The lateral join asks only whether any click carried this commission id, so
 * an affiliate whose click and sale are both on file counts once — a plain join
 * would multiply the sale by the number of matching visits.
 */
async function ledgerByDay(
  affiliateId: string,
  range: PeriodRange | null
): Promise<LedgerDayRow[]> {
  return prisma.$queryRaw<LedgerDayRow[]>`
    SELECT
      ${STORE_DAY} AS day,
      COALESCE(SUM(le."amount"), 0) AS earnings,
      COALESCE(
        SUM(COALESCE(le."commissionBase", le."orderRevenue"))
          FILTER (WHERE le."type" = 'DIRECT'),
        0
      ) AS revenue,
      COUNT(*) FILTER (WHERE le."type" = 'DIRECT') AS sales,
      COUNT(*) FILTER (WHERE le."type" = 'DIRECT' AND v.hit IS NOT NULL) AS tracked
    FROM "LedgerEntry" le
    LEFT JOIN LATERAL (
      SELECT 1 AS hit
      FROM "Visit" v
      WHERE v."slicewpCommissionId" = le."slicewpCommissionId"
        AND v."affiliateId" = le."affiliateId"
      LIMIT 1
    ) v ON TRUE
    WHERE le."affiliateId" = ${affiliateId}
      ${rangeClause(range)}
    GROUP BY 1
    ORDER BY 1
  `;
}

async function visitsByDay(
  affiliateId: string,
  range: PeriodRange | null
): Promise<VisitDayRow[]> {
  return prisma.$queryRaw<VisitDayRow[]>`
    SELECT ${STORE_DAY} AS day, COUNT(*) AS clicks
    FROM "Visit"
    WHERE "affiliateId" = ${affiliateId}
      ${rangeClause(range)}
    GROUP BY 1
    ORDER BY 1
  `;
}

/** Merges the two daily series into one row per day that saw any activity. */
function mergeDaily(
  ledger: LedgerDayRow[],
  visits: VisitDayRow[]
): PerformancePoint[] {
  const byDate = new Map<string, PerformancePoint>();

  const at = (date: string): PerformancePoint => {
    const existing = byDate.get(date);
    if (existing) return existing;
    const created = { date, earnings: 0, revenue: 0, clicks: 0, sales: 0 };
    byDate.set(date, created);
    return created;
  };

  for (const row of ledger) {
    const point = at(row.day);
    point.earnings = toNumber(row.earnings);
    point.revenue = toNumber(row.revenue);
    point.sales = Number(row.sales);
  }

  for (const row of visits) {
    at(row.day).clicks = Number(row.clicks);
  }

  return Array.from(byDate.values()).sort((a, b) =>
    a.date.localeCompare(b.date)
  );
}

/**
 * Fills the gaps so a quiet Tuesday reads as a zero-height bar rather than
 * vanishing and pulling Wednesday left. Only worth doing for bounded windows;
 * all-time would invent years of empty days.
 */
function padDaily(
  points: PerformancePoint[],
  range: PeriodRange | null
): PerformancePoint[] {
  if (!range) return points;

  const byDate = new Map(points.map((point) => [point.date, point]));
  const filled: PerformancePoint[] = [];

  // Walked as calendar days in store time rather than by adding 24h, so DST
  // transitions do not skip or repeat a bar.
  const format = new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  for (
    let cursor = new Date(range.from);
    cursor < range.to;
    cursor = new Date(cursor.getTime() + 24 * 60 * 60 * 1000)
  ) {
    const date = format.format(cursor);
    if (filled.at(-1)?.date === date) continue;
    filled.push(
      byDate.get(date) ?? { date, earnings: 0, revenue: 0, clicks: 0, sales: 0 }
    );
  }

  return filled;
}

function totalsFrom(
  daily: PerformancePoint[],
  attribution: SalesAttribution
): PerformanceTotals {
  const earnings = daily.reduce((sum, point) => sum + point.earnings, 0);
  const revenue = daily.reduce((sum, point) => sum + point.revenue, 0);
  const clicks = daily.reduce((sum, point) => sum + point.clicks, 0);
  const sales = daily.reduce((sum, point) => sum + point.sales, 0);

  return {
    earnings: Math.round(earnings * 100) / 100,
    revenue: Math.round(revenue * 100) / 100,
    clicks,
    sales,
    conversionRate: clicks > 0 ? (attribution.tracked / clicks) * 100 : null,
  };
}

function attributionFrom(ledger: LedgerDayRow[]): SalesAttribution {
  let tracked = 0;
  let sales = 0;

  for (const row of ledger) {
    tracked += Number(row.tracked);
    sales += Number(row.sales);
  }

  return { tracked, untracked: sales - tracked };
}

function byDayOfWeek(daily: PerformancePoint[]): DayOfWeekPoint[] {
  const buckets = DAY_LABELS.map((label, index) => ({
    day: index + 1,
    label,
    clicks: 0,
    sales: 0,
  }));

  for (const point of daily) {
    // Parsed as a plain calendar date; the day name is a property of the store
    // day we already bucketed into, not of any instant inside it.
    const [year, month, day] = point.date.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
    const index = (weekday + 6) % 7; // Sunday is 0 upstream; the store week starts Monday.
    buckets[index].clicks += point.clicks;
    buckets[index].sales += point.sales;
  }

  return buckets;
}

export async function getAffiliatePerformance(
  affiliateId: string,
  range: PeriodRange | null,
  previousRange: PeriodRange | null
): Promise<AffiliatePerformance> {
  // Sequential rather than parallel: the ledger queries elsewhere in this app
  // are deliberately single-connection-safe and this runs on the same pool.
  const ledger = await ledgerByDay(affiliateId, range);
  const visits = await visitsByDay(affiliateId, range);

  const attribution = attributionFrom(ledger);
  const daily = padDaily(mergeDaily(ledger, visits), range);
  const current = totalsFrom(daily, attribution);

  let previous: PerformanceTotals | null = null;
  let previousAttribution: SalesAttribution | null = null;

  if (previousRange) {
    const previousLedger = await ledgerByDay(affiliateId, previousRange);
    const previousVisits = await visitsByDay(affiliateId, previousRange);
    previousAttribution = attributionFrom(previousLedger);
    previous = totalsFrom(
      mergeDaily(previousLedger, previousVisits),
      previousAttribution
    );
  }

  return {
    current,
    previous,
    daily,
    byDayOfWeek: byDayOfWeek(daily),
    attribution,
    previousAttribution,
  };
}
