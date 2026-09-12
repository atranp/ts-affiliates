import type { LedgerData, LedgerEntry } from "@/lib/ledger/types";
import type { CommissionDetailResponse } from "@/lib/ledger/commission-detail";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import {
  commissionOverrideWhyHeadline,
  commissionWhyHeadline,
} from "@/lib/ledger/attribution-audit";
import { formatAppDate } from "@/lib/timezone";
import type { ResolvedPeriod } from "@/lib/affiliate/period";
import type { LedgerSortKey, SortDirection } from "@/lib/ledger/sort";
import { defaultSortDirection, sortLedgerEntries } from "@/lib/ledger/sort";
import type { PayoutBatchDetail, PayoutBatchListItem } from "@/lib/payouts/types";
import {
  MOCK_RECRUITS,
  buildMockPayoutDetail,
  buildMockPayoutListItem,
  type MockPayoutPayee,
  type MockPayoutSpec,
} from "./payout-fixtures";
import { PAID_STATUS } from "@/lib/payouts/status";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import { MOCK_AFFILIATE_ID } from "./affiliate-auth";

const now = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86_400_000).toISOString();

function mockOrderDetail(
  id: number,
  commissionBase: string,
  date: string,
  coupons: string[] = [],
  shipping = "12.00",
  tax = "8.50"
) {
  const orderTotal = (
    Number(commissionBase) + Number(shipping) + Number(tax)
  ).toFixed(2);
  return {
    id,
    commissionBase,
    shipping,
    tax,
    orderTotal,
    date,
    coupons,
  };
}

const MOCK_TEAM_ID = "mock-team-downline";

const blairId = "mock-member-blair";
const pedroId = "mock-member-pedro";
const marinaId = "mock-member-marina";
const whitneyId = "mock-member-whitney";

export const MOCK_TEAM_SUMMARY: TeamSummary = {
  id: MOCK_TEAM_ID,
  name: "My downline",
  description: null,
  active: true,
  sponsorAffiliateId: MOCK_AFFILIATE_ID,
  slicewpKey: "slicewp-downline",
  memberCount: 18,
  ruleCount: 1,
  stats: {
    totalRevenue: 177_300.13,
    unpaidTeamBonus: 17_381.08,
    pendingTeamBonus: 291.53,
    paidTeamBonus: 4_200,
  },
};

function member(
  id: string,
  displayName: string,
  email: string,
  stats: TeamDetail["members"][0]["stats"]
): TeamDetail["members"][0] {
  return {
    id,
    displayName,
    email,
    status: "ACTIVE",
    slicewpId: id.length,
    rules: [],
    stats,
  };
}

export const MOCK_TEAM_DETAIL: TeamDetail = {
  ...MOCK_TEAM_SUMMARY,
  rules: [
    {
      id: "mock-rule-1",
      name: "Team override",
      ratePercent: "10",
      commissionDivisor: 3,
      milestoneRevenueThreshold: "5000",
      active: true,
      recruit: null,
    },
  ],
  members: [
    member(blairId, "Blair Rodgers", "blair@example.com", {
      totalRevenue: 173_800,
      unpaidTeamBonus: 16_950,
      pendingTeamBonus: 0,
      paidTeamBonus: 3_800,
      milestone: {
        current: 173_800,
        threshold: 5_000,
        met: true,
        remaining: 0,
      },
    }),
    member(pedroId, "Pedro Garza", "pedro@example.com", {
      totalRevenue: 1_850,
      unpaidTeamBonus: 185,
      pendingTeamBonus: 0,
      paidTeamBonus: 120,
      milestone: {
        current: 1_850,
        threshold: 5_000,
        met: false,
        remaining: 3_150,
      },
    }),
    member(marinaId, "Marina Hales", "marina@example.com", {
      totalRevenue: 980,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 98,
      paidTeamBonus: 0,
      milestone: {
        current: 980,
        threshold: 5_000,
        met: false,
        remaining: 4_020,
      },
    }),
    member(whitneyId, "Whitney Guthrie", "whitney@example.com", {
      totalRevenue: 420,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 42,
      paidTeamBonus: 0,
      milestone: {
        current: 420,
        threshold: 5_000,
        met: false,
        remaining: 4_580,
      },
    }),
    member("mock-member-5", "Alex Chen", "alex@example.com", {
      totalRevenue: 250,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 25,
      paidTeamBonus: 0,
      milestone: {
        current: 250,
        threshold: 5_000,
        met: false,
        remaining: 4_750,
      },
    }),
    member("mock-member-6", "Jordan Lee", "jordan@example.com", {
      totalRevenue: 0,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 0,
      paidTeamBonus: 0,
      milestone: {
        current: 0,
        threshold: 5_000,
        met: false,
        remaining: 5_000,
      },
    }),
    member("mock-member-7", "Sam Rivera", "sam@example.com", {
      totalRevenue: 0,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 0,
      paidTeamBonus: 0,
      milestone: null,
    }),
    member("mock-member-8", "Casey Morgan", "casey@example.com", {
      totalRevenue: 0,
      unpaidTeamBonus: 0,
      pendingTeamBonus: 0,
      paidTeamBonus: 0,
      milestone: null,
    }),
  ],
};

const ALL_ENTRIES: LedgerEntry[] = [
  {
    id: "le-1",
    type: "OVERRIDE",
    amount: "5.40",
    status: "UNPAID",
    description: "Blair Rodgers · Order #8309",
    wooOrderId: 8309,
    orderRevenue: "54.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(1),
    payoutBatchId: null,
    sourceAffiliateId: blairId,
    sourceAffiliate: { displayName: "Blair Rodgers", email: "blair@example.com" },
  },
  {
    id: "le-2",
    type: "DIRECT",
    amount: "26.00",
    status: "UNPAID",
    description: "Order #8306",
    wooOrderId: 8306,
    orderRevenue: "260.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(2),
    payoutBatchId: null,
    sourceAffiliateId: null,
    sourceAffiliate: null,
    isLifetimeSale: true,
  },
  {
    id: "le-3",
    type: "OVERRIDE",
    amount: "12.50",
    status: "UNPAID",
    description: "Blair Rodgers · Order #8298",
    wooOrderId: 8298,
    orderRevenue: "125.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(3),
    payoutBatchId: null,
    sourceAffiliateId: blairId,
    sourceAffiliate: { displayName: "Blair Rodgers", email: "blair@example.com" },
  },
  {
    id: "le-4",
    type: "DIRECT",
    amount: "18.00",
    status: "PAID",
    description: "Order #8201",
    wooOrderId: 8201,
    orderRevenue: "180.00",
    payoutWeek: daysAgo(30),
    paidAt: daysAgo(28),
    occurredAt: daysAgo(35),
    payoutBatchId: "pb-1",
    payoutBatch: { id: "pb-1", label: "January payout", status: PAID_STATUS },
    sourceAffiliateId: null,
    sourceAffiliate: null,
  },
  {
    id: "le-5",
    type: "OVERRIDE",
    amount: "8.00",
    status: "PENDING",
    description: "Marina Hales · Order #8190",
    wooOrderId: 8190,
    orderRevenue: "80.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(5),
    payoutBatchId: null,
    sourceAffiliateId: marinaId,
    sourceAffiliate: { displayName: "Marina Hales", email: "marina@example.com" },
  },
  {
    id: "le-6",
    type: "DIRECT",
    amount: "42.00",
    status: "UNPAID",
    description: "Order #8188",
    wooOrderId: 8188,
    orderRevenue: "420.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(6),
    payoutBatchId: null,
    sourceAffiliateId: null,
    sourceAffiliate: null,
  },
  {
    id: "le-7",
    type: "OVERRIDE",
    amount: "22.00",
    status: "UNPAID",
    description: "Pedro Garza · Order #8175",
    wooOrderId: 8175,
    orderRevenue: "220.00",
    payoutWeek: null,
    paidAt: null,
    occurredAt: daysAgo(8),
    payoutBatchId: null,
    sourceAffiliateId: pedroId,
    sourceAffiliate: { displayName: "Pedro Garza", email: "pedro@example.com" },
  },
  {
    id: "le-8",
    type: "DIRECT",
    amount: "15.00",
    status: "PAID",
    description: "Order #8100",
    wooOrderId: 8100,
    orderRevenue: "150.00",
    payoutWeek: daysAgo(60),
    paidAt: daysAgo(58),
    occurredAt: daysAgo(62),
    payoutBatchId: "pb-2",
    payoutBatch: { id: "pb-2", label: "December payout", status: PAID_STATUS },
    sourceAffiliateId: null,
    sourceAffiliate: null,
  },
];

const SELF: MockPayoutPayee = {
  affiliateId: MOCK_AFFILIATE_ID,
  displayName: "Trindalyn Mackenzie",
  email: "demo.affiliate@true-sciences.local",
};

/** What the signed-in affiliate has been paid, newest first. */
const PAYOUT_SPECS: MockPayoutSpec[] = [
  {
    id: "pb-1",
    source: "PLATFORM",
    label: "January payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 6,
    periodDays: 30,
    entryCount: 142,
    totalAmount: 12_450.22,
    overrideRatio: 0.4,
    recruits: [MOCK_RECRUITS.blair, MOCK_RECRUITS.pedro, MOCK_RECRUITS.marina],
  },
  {
    id: "pb-slicewp-1",
    source: "SLICEWP",
    label: "Trindalyn Mackenzie · payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 22,
    periodDays: 22,
    entryCount: 63,
    totalAmount: 6_812.4,
    payoutMethod: "paypal",
  },
  {
    id: "pb-2",
    source: "PLATFORM",
    label: "December payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 37,
    periodDays: 30,
    entryCount: 118,
    totalAmount: 14_524.15,
    overrideRatio: 0.3,
    recruits: [MOCK_RECRUITS.blair, MOCK_RECRUITS.whitney],
    bonuses: [
      { description: "Year-end volume bonus", amount: 1_000 },
      { description: "Refund adjustment · Order #8042", amount: -212.4 },
    ],
  },
  {
    id: "pb-3",
    source: "PLATFORM",
    label: "November payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 66,
    periodDays: 30,
    entryCount: 91,
    totalAmount: 8_207.66,
    overrideRatio: 0.25,
    recruits: [MOCK_RECRUITS.pedro],
  },
  {
    id: "pb-slicewp-2",
    source: "SLICEWP",
    label: "Trindalyn Mackenzie · payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 84,
    periodDays: 28,
    entryCount: 7,
    totalAmount: 318.75,
    payoutMethod: "store_credit",
  },
  {
    id: "pb-4",
    source: "PLATFORM",
    label: "October payout",
    payees: [SELF],
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    sponsorName: SELF.displayName,
    recordedDaysAgo: 97,
    periodDays: 30,
    entryCount: 2,
    totalAmount: 96.5,
  },
];

const PAYOUT_DETAILS = new Map(
  PAYOUT_SPECS.map((spec) => [spec.id, buildMockPayoutDetail(spec)])
);

export const MOCK_PAYOUT_BATCHES: PayoutBatchListItem[] =
  PAYOUT_SPECS.map(buildMockPayoutListItem);

const SUMMARY = {
  unpaidTotal: 21_658.62,
  paidTotal: 26_974.37,
  pendingTotal: 316.03,
  unpaidCount: 2_505,
  paidCount: 1_790,
  pendingCount: 24,
};

const OVERRIDE_SUMMARY = {
  unpaidTotal: 17_381.08,
  paidTotal: 4_200,
  pendingTotal: 291.53,
  unpaidCount: 1_814,
  paidCount: 320,
  pendingCount: 18,
};

const TAB_COUNTS = {
  all: 4_319,
  unpaid: 2_505,
  paid: 1_790,
  pending: 24,
  overrides: 1_814,
  direct: 2_504,
  lifetime: 1,
};

function sumAmount(entries: LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + Number(entry.amount), 0);
}

export function mockLedgerResponse(options: {
  status?: string;
  type?: string;
  directKind?: "lifetime" | "standard";
  sourceAffiliateId?: string;
  q?: string;
  page?: number;
  limit?: number;
  sortBy?: LedgerSortKey;
  sortDir?: SortDirection;
}): LedgerData {
  let rows = [...ALL_ENTRIES];

  if (options.status && options.status !== "all") {
    const status = options.status.toUpperCase();
    rows = rows.filter((entry) => entry.status === status);
  }

  if (options.directKind === "lifetime") {
    rows = rows.filter(
      (entry) => entry.type === "DIRECT" && entry.isLifetimeSale
    );
  } else if (options.directKind === "standard") {
    rows = rows.filter(
      (entry) => entry.type === "DIRECT" && !entry.isLifetimeSale
    );
  } else if (options.type === "DIRECT") {
    rows = rows.filter((entry) => entry.type === "DIRECT");
  } else if (options.type === "OVERRIDE") {
    rows = rows.filter((entry) => entry.type === "OVERRIDE");
  }

  if (options.sourceAffiliateId) {
    rows = rows.filter(
      (entry) => entry.sourceAffiliateId === options.sourceAffiliateId
    );
  }

  if (options.q?.trim()) {
    const needle = options.q.trim().toLowerCase();
    rows = rows.filter((entry) =>
      [
        entry.description,
        entry.sourceAffiliate?.displayName,
        entry.sourceAffiliate?.email,
        entry.wooOrderId?.toString(),
      ]
        .filter(Boolean)
        .some((value) => value!.toLowerCase().includes(needle))
    );
  }

  const page = Math.max(1, options.page ?? 1);
  const limit = Math.max(1, options.limit ?? 50);
  const sortBy = options.sortBy ?? "date";
  const sortDir = options.sortDir ?? defaultSortDirection(sortBy);
  const sorted = sortLedgerEntries(rows, sortBy, sortDir);
  const total = sorted.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start = (page - 1) * limit;
  const entries = sorted.slice(start, start + limit).map((entry) => {
    if (entry.type !== "DIRECT") {
      return { ...entry, trackedByClick: null };
    }

    if (entry.isLifetimeSale) {
      return { ...entry, trackedByClick: false };
    }

    // Varied attribution for the detail drawer workstream: click, cookie-only, no click.
    if (entry.id === "le-4") {
      return { ...entry, trackedByClick: true };
    }
    if (entry.id === "le-5") {
      return { ...entry, trackedByClick: false };
    }

    return {
      ...entry,
      trackedByClick: entry.wooOrderId !== null && entry.wooOrderId % 3 !== 0,
    };
  });

  return {
    entries,
    page,
    limit,
    total,
    totalPages,
    filtered: { amount: sumAmount(sorted), count: total },
    summary: SUMMARY,
    accountSummary: {
      unpaidTotal: 4_277.54,
      paidTotal: 22_774.37,
      pendingTotal: 24.5,
      unpaidCount: 691,
      paidCount: 1_470,
      pendingCount: 6,
    },
    overrideAccountSummary: OVERRIDE_SUMMARY,
    tabCounts: TAB_COUNTS,
    overrideSummary: {
      unpaidTotal: OVERRIDE_SUMMARY.unpaidTotal,
      paidTotal: OVERRIDE_SUMMARY.paidTotal,
      pendingTotal: OVERRIDE_SUMMARY.pendingTotal,
      unpaidCount: OVERRIDE_SUMMARY.unpaidCount,
      paidCount: OVERRIDE_SUMMARY.paidCount,
    },
    teamBonuses: [],
    sourceAffiliates: MOCK_TEAM_DETAIL.members
      .filter((m) => m.stats.unpaidTeamBonus > 0 || m.stats.pendingTeamBonus > 0)
      .map((m) => ({
        id: m.id,
        displayName: m.displayName,
        email: m.email,
      })),
  };
}

export function mockTeamsResponse() {
  return { teams: [MOCK_TEAM_SUMMARY] };
}

export function mockTeamDetailResponse(teamId: string) {
  if (teamId !== MOCK_TEAM_ID) {
    return null;
  }
  return { team: MOCK_TEAM_DETAIL };
}

export function mockPayoutsResponse() {
  return { batches: MOCK_PAYOUT_BATCHES };
}

export function mockPayoutDetailResponse(
  batchId: string
): { batch: PayoutBatchDetail } | null {
  const batch = PAYOUT_DETAILS.get(batchId);
  return batch ? { batch } : null;
}

/** Legacy `/api/team` shape (flat member list with deal rules). */
export function mockLegacyTeamResponse() {
  const rule = MOCK_TEAM_DETAIL.rules[0]!;
  return {
    team: MOCK_TEAM_DETAIL.members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      email: member.email,
      status: member.status,
      slicewpId: member.slicewpId,
      sources: ["deal_rule" as const],
      dealRule: {
        id: rule.id,
        name: rule.name,
        ratePercent: rule.ratePercent,
        milestoneRevenueThreshold: rule.milestoneRevenueThreshold,
      },
      stats: {
        totalRevenue: member.stats.totalRevenue,
        unpaidTeamBonus: member.stats.unpaidTeamBonus,
        pendingTeamBonus: member.stats.pendingTeamBonus,
        paidTeamBonus: member.stats.paidTeamBonus,
        milestone: member.stats.milestone,
      },
    })),
  };
}

/**
 * M5 promotional data: link, visits, creatives, coupons, settings.
 *
 * Settings are held in a module-level object so an edit in mock mode behaves
 * like a real save for the rest of the session, the same way the payout
 * fixtures track what has been paid.
 */

const MOCK_SITE = "https://true-sciences.com";

const mockSettingsState = {
  paymentEmail: "trindalyn.mackenzie11@gmail.com",
  website: "https://trindalyn.example.com",
  customSlug: "Trin",
};

function mockReferralUrl(): string {
  return mockSettingsState.customSlug
    ? `${MOCK_SITE}/aff/${mockSettingsState.customSlug}/`
    : `${MOCK_SITE}/aff/104/`;
}

export function mockAffiliateLink() {
  return {
    referralUrl: mockReferralUrl(),
    customSlug: mockSettingsState.customSlug || null,
    storeCreditBalance: 0,
  };
}

/** Mirrors what WordPress would build: the slug appended to the given page. */
export function mockGeneratedLink(url: string): string {
  const trimmed = url.replace(/\/+$/, "");
  const slug = mockSettingsState.customSlug || "104";
  return `${trimmed}/aff/${slug}/`;
}

const MOCK_LANDING_PAGES = [
  "/",
  "/shop/",
  "/products/creatine-monohydrate/",
  "/products/whey-isolate/",
  "/blog/how-to-cycle-creatine/",
];

const MOCK_REFERRERS = [
  "https://www.instagram.com/",
  "https://www.google.com/",
  "https://t.co/",
  null,
];

/** Every seventeenth click converts, matching the fixture's headline rate. */
const MOCK_CONVERTS_EVERY = 17;

export function mockAffiliateVisits(page = 1, convertedOnly?: boolean) {
  const pageSize = 50;
  const total = 13_309;
  const converted = 214;

  /**
   * The outcome filter narrows the list the same way the real query does, so
   * the chips visibly do something in mock mode rather than returning the same
   * fifty rows under all three labels.
   */
  const listTotal =
    convertedOnly === undefined
      ? total
      : convertedOnly
        ? converted
        : total - converted;

  const recent = Array.from({ length: pageSize }, (_, index) => {
    const slot = (page - 1) * pageSize + index;
    // Walk the matching subsequence rather than filtering a page, so a filtered
    // page is full instead of showing the three hits that happened to land in it.
    const absolute =
      convertedOnly === undefined
        ? slot
        : convertedOnly
          ? slot * MOCK_CONVERTS_EVERY
          : slot + Math.floor(slot / (MOCK_CONVERTS_EVERY - 1)) + 1;

    return {
      id: `mock-visit-${absolute}`,
      landingUrl: `${MOCK_SITE}${MOCK_LANDING_PAGES[absolute % MOCK_LANDING_PAGES.length]}`,
      referrerUrl: MOCK_REFERRERS[absolute % MOCK_REFERRERS.length],
      converted: absolute % MOCK_CONVERTS_EVERY === 0,
      occurredAt: daysAgo(Math.floor(absolute / 6)),
    };
  }).slice(0, Math.max(0, Math.min(pageSize, listTotal - (page - 1) * pageSize)));

  // A gentle wave rather than a flat line, so the chart is legibly a chart.
  const daily = Array.from({ length: 30 }, (_, index) => {
    const day = new Date(now.getTime() - (29 - index) * 86_400_000);
    const visits = 40 + Math.round(25 * Math.sin(index / 3.2)) + (index % 5) * 3;
    return {
      date: day.toISOString().slice(0, 10),
      visits,
      converted: Math.round(visits * 0.023),
    };
  });

  return {
    stats: {
      total,
      last7Days: 412,
      last30Days: 1_842,
      converted,
      conversionRate: (converted / total) * 100,
      lastVisitAt: daysAgo(0),
    },
    recent,
    daily,
    // Paging and the "N clicks" caption follow the filtered list; the stats
    // above stay account-wide so the filter has something to be a share of.
    total: listTotal,
    page,
    pageSize,
  };
}

/**
 * Performance for whatever window the picker asks for. Shaped like the real
 * thing — most sales trace to a click, a meaningful minority do not — so the
 * attribution panel is exercised rather than always showing a full bar.
 */
export function mockAffiliatePerformance(period: ResolvedPeriod) {
  const DAY = 86_400_000;
  const range = period.range;

  const days = range
    ? Math.max(1, Math.round((range.to.getTime() - range.from.getTime()) / DAY))
    : 30;
  const start = range ? range.from : new Date(now.getTime() - 29 * DAY);

  // Seeded from the calendar day rather than the loop index, so two windows of
  // the same length over different dates do not come back with identical
  // numbers — which would make the period picker look broken when it is not.
  const daily = Array.from({ length: Math.min(days, 180) }, (_, index) => {
    const day = new Date(start.getTime() + index * DAY);
    const seed = Math.floor(day.getTime() / DAY);
    const clicks = 34 + Math.round(22 * Math.sin(seed / 3.1)) + (seed % 5) * 4;
    const sales = seed % 4 === 0 ? 0 : seed % 7 === 0 ? 3 : 1;
    const earnings = Math.round(sales * 28.4 * 100) / 100;
    return {
      date: day.toISOString().slice(0, 10),
      clicks,
      sales,
      earnings,
      revenue: Math.round(sales * 94.5 * 100) / 100,
    };
  });

  const sales = daily.reduce((sum, point) => sum + point.sales, 0);
  const clicks = daily.reduce((sum, point) => sum + point.clicks, 0);
  const earnings =
    Math.round(daily.reduce((sum, point) => sum + point.earnings, 0) * 100) / 100;
  const revenue =
    Math.round(daily.reduce((sum, point) => sum + point.revenue, 0) * 100) / 100;
  const tracked = Math.round(sales * 0.71);

  const byDayOfWeek = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
    (label, index) => ({ day: index + 1, label, clicks: 0, sales: 0 })
  );

  for (const point of daily) {
    const [y, m, d] = point.date.split("-").map(Number);
    const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const bucket = byDayOfWeek[(weekday + 6) % 7];
    bucket.clicks += point.clicks;
    bucket.sales += point.sales;
  }

  return {
    current: {
      earnings,
      revenue,
      clicks,
      sales,
      conversionRate: clicks > 0 ? (tracked / clicks) * 100 : null,
    },
    previous: period.previous
      ? {
          earnings: Math.round(earnings * 0.84 * 100) / 100,
          revenue: Math.round(revenue * 0.84 * 100) / 100,
          clicks: Math.round(clicks * 0.76),
          sales: Math.round(sales * 1.1),
          conversionRate:
            clicks > 0 ? (tracked / Math.round(clicks * 0.76)) * 100 : null,
        }
      : null,
    daily,
    byDayOfWeek,
    attribution: { tracked, untracked: sales - tracked },
    previousAttribution: period.previous
      ? {
          tracked: Math.round(tracked * 1.18),
          untracked: Math.round((sales - tracked) * 0.9),
        }
      : null,
    period: {
      key: period.key,
      label: period.label,
      comparisonLabel: period.comparisonLabel,
    },
  };
}

export function mockAffiliateCoupons() {
  return [
    {
      id: "mock-coupon-trin10",
      origin: "woo",
      code: "TRIN10",
      amount: "10%",
      uses: { paid: 96, unpaid: 12, pending: 3, rejected: 1 },
      totalUses: 112,
    },
    {
      id: "mock-coupon-trinship",
      origin: "woo",
      code: "TRINSHIP",
      amount: "$5.00",
      uses: { paid: 0, unpaid: 0, pending: 0, rejected: 0 },
      totalUses: 0,
    },
  ];
}

export function mockAffiliateCreatives() {
  return {
    referralUrl: mockReferralUrl(),
    creatives: [
      {
        id: "mock-creative-banner",
        name: "Spring campaign banner",
        description: "728x90 leaderboard for blog sidebars.",
        type: "image",
        imageUrl: `${MOCK_SITE}/wp-content/uploads/mock-banner.png`,
        altText: "True Sciences spring campaign",
        text: null,
        landingUrl: `${MOCK_SITE}/shop/`,
      },
      {
        id: "mock-creative-text",
        name: "Creatine text link",
        description: "Short copy for newsletters.",
        type: "text",
        imageUrl: null,
        altText: null,
        text: "Clinically dosed creatine, third-party tested. Save 10% today.",
        landingUrl: `${MOCK_SITE}/products/creatine-monohydrate/`,
      },
    ],
  };
}

export function mockAffiliateSettings() {
  return {
    paymentEmail: mockSettingsState.paymentEmail,
    accountEmail: "trindalyn.mackenzie11@gmail.com",
    website: mockSettingsState.website,
    customSlug: mockSettingsState.customSlug || null,
    referralUrl: mockReferralUrl(),
  };
}

/**
 * Returns a rejection rather than throwing so the route can map it to the same
 * status a real SliceWP refusal produces.
 */
export function mockSaveAffiliateSettings(edit: {
  paymentEmail?: string;
  website?: string;
  customSlug?: string;
}):
  | { ok: true; result: ReturnType<typeof mockAffiliateSettings> & { mirrored: boolean } }
  | { ok: false; error: string; code: string; status: number } {
  // Lets the collision path be exercised in mock mode: this slug is "taken".
  if (edit.customSlug && edit.customSlug.toLowerCase() === "taken") {
    return {
      ok: false,
      error: "That custom slug is already in use.",
      code: "slug_taken",
      status: 409,
    };
  }

  if (edit.customSlug && /^\d+$/.test(edit.customSlug)) {
    return {
      ok: false,
      error: "The custom slug cannot be a number.",
      code: "slug_numeric",
      status: 400,
    };
  }

  if (edit.paymentEmail !== undefined) {
    mockSettingsState.paymentEmail = edit.paymentEmail;
  }
  if (edit.website !== undefined) {
    mockSettingsState.website = edit.website;
  }
  if (edit.customSlug !== undefined) {
    mockSettingsState.customSlug = edit.customSlug;
  }

  return {
    ok: true,
    result: { ...mockAffiliateSettings(), mirrored: true },
  };
}

const MOCK_COMMISSION_DETAILS: Record<string, CommissionDetailResponse> = {
  "le-2": {
    entry: {
      id: "le-2",
      type: "DIRECT",
      amount: "26.00",
      status: "UNPAID",
      description: "Order #8306",
      wooOrderId: 8306,
      orderRevenue: "260.00",
      occurredAt: daysAgo(2),
      payoutWeek: null,
      paidAt: null,
      trackedByClick: false,
      isLifetimeSale: true,
    },
    why: {
      rule: "lifetime",
      headline:
        "Returning customer linked to you. No affiliate link or coupon on this order.",
      detail: null,
    },
    order: mockOrderDetail(8306, "260.00", "Aug 2, 2026"),
    customer: {
      label: "Linked customer · order 2 of 5",
      orderIndex: 2,
      totalOrders: 5,
      firstOrderId: 8100,
      firstLinkedAt: daysAgo(90),
    },
    journey: [
      {
        kind: "customer_linked",
        label: "First linked · Jun 6, 2026 · Order #8100",
        at: daysAgo(90),
        meta: { orderId: "8100" },
      },
      { kind: "order", label: "Order placed", at: daysAgo(2) },
      { kind: "commission", label: "Commission recorded", at: daysAgo(2) },
    ],
    payout: {
      status: "Pending payout",
      batchLabel: null,
      paidAt: null,
    },
  },
  "le-4": {
    entry: {
      id: "le-4",
      type: "DIRECT",
      amount: "18.00",
      status: "PAID",
      description: "Order #8201",
      wooOrderId: 8201,
      orderRevenue: "180.00",
      occurredAt: daysAgo(35),
      payoutWeek: daysAgo(30),
      paidAt: daysAgo(28),
      trackedByClick: true,
      isLifetimeSale: false,
    },
    why: {
      rule: "link",
      headline:
        "Your link was clicked and was the last referral at checkout.",
      detail: null,
    },
    order: mockOrderDetail(8201, "180.00", "Jul 1, 2026"),
    customer: {
      label: "New customer",
      orderIndex: null,
      totalOrders: null,
      firstOrderId: null,
      firstLinkedAt: null,
    },
    journey: [
      {
        kind: "click",
        label: "Link clicked",
        at: daysAgo(36),
        meta: { landing: "/products/true30" },
      },
      { kind: "order", label: "Order placed", at: daysAgo(35) },
      { kind: "commission", label: "Commission recorded", at: daysAgo(35) },
      { kind: "payout", label: "Paid out", at: daysAgo(28) },
    ],
    payout: {
      status: "Paid Aug 7, 2026",
      batchLabel: "January payout",
      paidAt: daysAgo(28),
    },
  },
  "le-5": {
    entry: {
      id: "le-5",
      type: "OVERRIDE",
      amount: "8.00",
      status: "PENDING",
      description: "Marina Hales · Order #8190",
      wooOrderId: 8190,
      orderRevenue: "80.00",
      occurredAt: daysAgo(5),
      payoutWeek: null,
      paidAt: null,
      trackedByClick: null,
      isLifetimeSale: false,
    },
    why: {
      rule: "override",
      headline: "Team bonus from Marina Hales's sale on order #8190.",
      detail: null,
    },
    order: mockOrderDetail(8190, "80.00", "Aug 30, 2026"),
    customer: null,
    journey: [],
    payout: {
      status: "Awaiting milestone",
      batchLabel: null,
      paidAt: null,
    },
  },
  "le-6": {
    entry: {
      id: "le-6",
      type: "DIRECT",
      amount: "42.00",
      status: "UNPAID",
      description: "Order #8188",
      wooOrderId: 8188,
      orderRevenue: "420.00",
      occurredAt: daysAgo(6),
      payoutWeek: null,
      paidAt: null,
      trackedByClick: true,
      isLifetimeSale: false,
    },
    why: {
      rule: "coupon",
      headline:
        "Your coupon BLAIR-9562 was used. Coupon attribution beats link attribution.",
      detail: null,
    },
    order: mockOrderDetail(8188, "420.00", "Aug 29, 2026", ["BLAIR-9562"], "15.00", "35.00"),
    customer: {
      label: "New customer",
      orderIndex: null,
      totalOrders: null,
      firstOrderId: null,
      firstLinkedAt: null,
    },
    journey: [
      {
        kind: "click",
        label: "Link clicked",
        at: daysAgo(7),
        meta: { landing: "/shop" },
      },
      {
        kind: "coupon",
        label: "Coupon used",
        at: daysAgo(6),
        meta: { code: "BLAIR-9562" },
      },
      { kind: "order", label: "Order placed", at: daysAgo(6) },
      { kind: "commission", label: "Commission recorded", at: daysAgo(6) },
    ],
    payout: {
      status: "Pending payout",
      batchLabel: null,
      paidAt: null,
    },
  },
  "le-8": {
    entry: {
      id: "le-8",
      type: "DIRECT",
      amount: "15.00",
      status: "PAID",
      description: "Order #8100",
      wooOrderId: 8100,
      orderRevenue: "150.00",
      occurredAt: daysAgo(62),
      payoutWeek: daysAgo(60),
      paidAt: daysAgo(58),
      trackedByClick: false,
      isLifetimeSale: false,
    },
    why: {
      rule: "link",
      headline:
        "Your referral was stored on this order. No new click was recorded.",
      detail: null,
    },
    order: mockOrderDetail(8100, "150.00", "Jul 4, 2026"),
    customer: {
      label: "New customer",
      orderIndex: null,
      totalOrders: null,
      firstOrderId: null,
      firstLinkedAt: null,
    },
    journey: [
      {
        kind: "cookie",
        label: "Referral stored on order",
        at: daysAgo(62),
      },
      { kind: "order", label: "Order placed", at: daysAgo(62) },
      { kind: "commission", label: "Commission recorded", at: daysAgo(62) },
      { kind: "payout", label: "Paid out", at: daysAgo(58) },
    ],
    payout: {
      status: "Paid Jul 8, 2026",
      batchLabel: "December payout",
      paidAt: daysAgo(58),
    },
  },
};

function mockTrackedByClick(entry: LedgerEntry): boolean | null {
  if (entry.type !== "DIRECT") return null;
  if (entry.isLifetimeSale) return false;
  if (entry.id === "le-4" || entry.id === "le-6") return true;
  if (entry.id === "le-8") return false;
  return entry.wooOrderId !== null && entry.wooOrderId % 3 !== 0;
}

function buildMockCommissionDetailFallback(
  entry: LedgerEntry
): CommissionDetailResponse {
  const copy = AFFILIATE_COPY.commissions.detail;
  const trackedByClick = mockTrackedByClick(entry);
  const isLifetimeSale = !!entry.isLifetimeSale;
  const recruitName =
    entry.sourceAffiliate?.displayName ??
    entry.sourceAffiliate?.email ??
    "Team member";

  if (entry.type === "OVERRIDE") {
    return {
      entry: {
        id: entry.id,
        type: entry.type,
        amount: entry.amount,
        status: entry.status,
        description: entry.description,
        wooOrderId: entry.wooOrderId,
        orderRevenue: entry.orderRevenue,
        occurredAt: entry.occurredAt,
        payoutWeek: entry.payoutWeek,
        paidAt: entry.paidAt,
        trackedByClick: null,
        isLifetimeSale: false,
      },
      why: {
        rule: "override",
        headline: commissionOverrideWhyHeadline(
          recruitName,
          entry.wooOrderId ?? 0
        ),
        detail: null,
      },
      order: entry.wooOrderId
        ? mockOrderDetail(
            entry.wooOrderId,
            entry.orderRevenue ?? "0",
            formatAppDate(entry.occurredAt)
          )
        : null,
      customer: null,
      journey: [],
      payout: {
        status:
          entry.status === "PAID"
            ? copy.payout.paid(formatAppDate(entry.paidAt ?? entry.occurredAt))
            : entry.status === "PENDING"
              ? copy.payout.awaitingMilestone
              : copy.payout.pending,
        batchLabel: entry.payoutBatch?.label ?? null,
        paidAt: entry.paidAt,
      },
    };
  }

  const rule = isLifetimeSale ? "lifetime" : trackedByClick ? "link" : "none";
  const headline = isLifetimeSale
    ? commissionWhyHeadline("lifetime")
    : trackedByClick
      ? commissionWhyHeadline("link", { hasVisitRow: true })
      : commissionWhyHeadline("none");

  return {
    entry: {
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      status: entry.status,
      description: entry.description,
      wooOrderId: entry.wooOrderId,
      orderRevenue: entry.orderRevenue,
      occurredAt: entry.occurredAt,
      payoutWeek: entry.payoutWeek,
      paidAt: entry.paidAt,
      trackedByClick,
      isLifetimeSale,
    },
    why: { rule, headline, detail: null },
    order: entry.wooOrderId
      ? mockOrderDetail(
          entry.wooOrderId,
          entry.orderRevenue ?? "0",
          formatAppDate(entry.occurredAt)
        )
      : null,
    customer: isLifetimeSale
      ? {
          label: copy.customer.linked(1, 1),
          orderIndex: 1,
          totalOrders: 1,
          firstOrderId: entry.wooOrderId,
          firstLinkedAt: entry.occurredAt,
        }
      : {
          label: copy.customer.newCustomer,
          orderIndex: null,
          totalOrders: null,
          firstOrderId: null,
          firstLinkedAt: null,
        },
    journey: [
      ...(isLifetimeSale && entry.wooOrderId
        ? [
            {
              kind: "customer_linked" as const,
              label: copy.journey.firstLinked(
                formatAppDate(entry.occurredAt),
                entry.wooOrderId
              ),
              at: entry.occurredAt,
              meta: { orderId: String(entry.wooOrderId) },
            },
          ]
        : []),
      ...(trackedByClick
        ? [
            {
              kind: "click" as const,
              label: copy.journey.click,
              at: entry.occurredAt,
              meta: { landing: "/shop" },
            },
          ]
        : []),
      {
        kind: "order" as const,
        label: copy.journey.order,
        at: entry.occurredAt,
        meta: entry.wooOrderId
          ? { orderId: String(entry.wooOrderId) }
          : undefined,
      },
      {
        kind: "commission" as const,
        label: copy.journey.commission,
        at: entry.occurredAt,
      },
      ...(entry.paidAt
        ? [
            {
              kind: "payout" as const,
              label: copy.journey.payout,
              at: entry.paidAt,
            },
          ]
        : []),
    ],
    payout: {
      status:
        entry.status === "PAID"
          ? copy.payout.paid(formatAppDate(entry.paidAt ?? entry.occurredAt))
          : entry.status === "PENDING"
            ? copy.payout.awaitingMilestone
            : copy.payout.pending,
      batchLabel: entry.payoutBatch?.label ?? null,
      paidAt: entry.paidAt,
    },
  };
}

export function mockCommissionDetailResponse(
  entryId: string
): CommissionDetailResponse | null {
  const curated = MOCK_COMMISSION_DETAILS[entryId];
  if (curated) return curated;

  const entry = ALL_ENTRIES.find((row) => row.id === entryId);
  if (!entry) return null;

  return buildMockCommissionDetailFallback(entry);
}
