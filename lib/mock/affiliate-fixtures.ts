import type { LedgerData, LedgerEntry } from "@/hooks/use-ledger";
import type { LedgerSortKey, SortDirection } from "@/lib/ledger/sort";
import { defaultSortDirection, sortLedgerEntries } from "@/lib/ledger/sort";
import type { PayoutBatchDetail, PayoutBatchListItem } from "@/lib/payouts/types";
import {
  AWAITING_PAYMENT_STATUS,
  PAID_STATUS,
} from "@/lib/payouts/status";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import { MOCK_AFFILIATE_ID } from "./affiliate-auth";

const now = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86_400_000).toISOString();

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

export const MOCK_PAYOUT_BATCHES: PayoutBatchListItem[] = [
  {
    id: "pb-1",
    label: "January payout",
    status: AWAITING_PAYMENT_STATUS,
    periodStart: daysAgo(45),
    periodEnd: daysAgo(15),
    processedAt: null,
    createdAt: daysAgo(30),
    teamId: null,
    teamName: null,
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    entryCount: 142,
    affiliateCount: 1,
    totalAmount: 12_450.22,
  },
  {
    id: "pb-2",
    label: "December payout",
    status: PAID_STATUS,
    periodStart: daysAgo(75),
    periodEnd: daysAgo(45),
    processedAt: daysAgo(58),
    createdAt: daysAgo(60),
    teamId: null,
    teamName: null,
    sponsorAffiliateId: MOCK_AFFILIATE_ID,
    entryCount: 118,
    affiliateCount: 1,
    totalAmount: 14_524.15,
  },
];

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
  direct: 2_505,
};

function sumAmount(entries: LedgerEntry[]): number {
  return entries.reduce((total, entry) => total + Number(entry.amount), 0);
}

export function mockLedgerResponse(options: {
  status?: string;
  type?: string;
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

  if (options.type === "DIRECT") {
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
  const entries = sorted.slice(start, start + limit);

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
  const summary = MOCK_PAYOUT_BATCHES.find((batch) => batch.id === batchId);
  if (!summary) return null;

  const linked = ALL_ENTRIES.filter((entry) => entry.payoutBatchId === batchId);
  const entries = (linked.length > 0 ? linked : ALL_ENTRIES.slice(0, 4)).map(
    (entry) => ({
      id: entry.id,
      type: entry.type,
      amount: Number(entry.amount),
      status: entry.status,
      description: entry.description,
      wooOrderId: entry.wooOrderId,
      orderRevenue: entry.orderRevenue ? Number(entry.orderRevenue) : null,
      occurredAt: entry.occurredAt,
      sourceAffiliate: entry.sourceAffiliateId
        ? {
            id: entry.sourceAffiliateId,
            displayName: entry.sourceAffiliate?.displayName ?? null,
            email: entry.sourceAffiliate?.email ?? "",
          }
        : null,
      dealRule: null,
    })
  );

  const directTotal = entries
    .filter((entry) => entry.type === "DIRECT")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const overrideTotal = entries
    .filter((entry) => entry.type === "OVERRIDE")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const grandTotal = directTotal + overrideTotal || summary.totalAmount;

  const recruitMap = new Map<
    string,
    {
      sourceAffiliateId: string;
      displayName: string | null;
      email: string;
      overrideTotal: number;
      overrideCount: number;
      sourceRevenue: number;
    }
  >();

  for (const entry of entries) {
    if (entry.type !== "OVERRIDE" || !entry.sourceAffiliate) continue;
    const current = recruitMap.get(entry.sourceAffiliate.id) ?? {
      sourceAffiliateId: entry.sourceAffiliate.id,
      displayName: entry.sourceAffiliate.displayName,
      email: entry.sourceAffiliate.email,
      overrideTotal: 0,
      overrideCount: 0,
      sourceRevenue: 0,
    };
    current.overrideTotal += entry.amount;
    current.overrideCount += 1;
    current.sourceRevenue += entry.orderRevenue ?? 0;
    recruitMap.set(entry.sourceAffiliate.id, current);
  }

  return {
    batch: {
      id: summary.id,
      label: summary.label,
      status: summary.status,
      periodStart: summary.periodStart,
      periodEnd: summary.periodEnd,
      processedAt: summary.processedAt,
      createdAt: summary.createdAt,
      teamId: summary.teamId,
      teamName: summary.teamName,
      sponsorAffiliateId: summary.sponsorAffiliateId,
      totals: {
        grandTotal,
        directTotal,
        overrideTotal,
        entryCount: entries.length,
      },
      items: [
        {
          affiliateId: MOCK_AFFILIATE_ID,
          displayName: "Trindalyn Mackenzie",
          email: "demo.affiliate@true-sciences.local",
          totalAmount: grandTotal,
          entryCount: entries.length,
          directTotal,
          overrideTotal,
        },
      ],
      recruitBreakdown: Array.from(recruitMap.values()),
      entries,
    },
  };
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
