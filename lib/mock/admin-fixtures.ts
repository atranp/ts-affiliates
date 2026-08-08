import type { AdminAffiliateDetail } from "@/lib/admin/types";
import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import type { PayoutBatchRow } from "@/components/payouts/PayoutHistoryPanel";
import {
  PREVIEW_ENTRY_LIMIT,
  PayoutConflictError,
  PayoutInputError,
  type CreatedPayout,
  type PayoutDraft,
  type PayoutDraftEntry,
  type PayoutSelection,
  type PayoutTarget,
  payoutTargetKey,
} from "@/lib/payouts/create";
import type { PayoutOptions } from "@/lib/payouts/options";
import type { PayoutBatchDetail } from "@/lib/payouts/types";
import { PAID_STATUS } from "@/lib/payouts/status";
import { MOCK_AFFILIATE_ID } from "./affiliate-auth";

/** Shared IDs — keep in sync with lib/mock/affiliate-fixtures.ts */
export const MOCK_TEAM_ID = "mock-team-downline";
export const MOCK_BLAIR_ID = "mock-member-blair";
export const MOCK_PEDRO_ID = "mock-member-pedro";
export const MOCK_JORDAN_ID = "mock-affiliate-jordan";

const now = new Date();
const daysAgo = (n: number) =>
  new Date(now.getTime() - n * 86_400_000).toISOString();

const TRINDALYN: AffiliateOption = {
  id: MOCK_AFFILIATE_ID,
  email: "trindalyn.mackenzie11@gmail.com",
  displayName: "Trindalyn Mackenzie",
  slicewpId: 1101,
  status: "ACTIVE",
};

const JORDAN: AffiliateOption = {
  id: MOCK_JORDAN_ID,
  email: "jordan.lee@example.com",
  displayName: "Jordan Lee",
  slicewpId: 1102,
  status: "ACTIVE",
};

const SEARCHABLE: AffiliateOption[] = [TRINDALYN, JORDAN];

/** Priced like production: direct from SliceWP rates, Blair at 10% override. */
type MockPricing = {
  amount: number;
  entryCount: number;
  revenue: number;
  math: string;
};

const PRICING: {
  direct: MockPricing;
  blair: MockPricing;
  unattributed: { amount: number; entryCount: number };
} = {
  direct: {
    amount: 4_378.94,
    entryCount: 120,
    revenue: 15_663.2,
    math: "$15,663.20 in sales × ~27.95% avg",
  },
  blair: {
    amount: 1_975.28,
    entryCount: 189,
    revenue: 19_749.73,
    math: "$19,749.73 in sales × 10% each",
  },
  unattributed: { amount: 125.5, entryCount: 2 },
};

type MockBatchRecord = PayoutBatchRow & {
  periodStart: string;
  periodEnd: string;
  teamId: string | null;
};

function toPayoutBatchRow(batch: MockBatchRecord): PayoutBatchRow {
  return {
    id: batch.id,
    label: batch.label,
    status: batch.status,
    processedAt: batch.processedAt,
    createdAt: batch.createdAt,
    teamName: batch.teamName,
    sponsorAffiliateId: batch.sponsorAffiliateId,
    sponsorName: batch.sponsorName,
    entryCount: batch.entryCount,
    affiliateCount: batch.affiliateCount,
    totalAmount: batch.totalAmount,
  };
}

type MockSession = {
  cutoff: string;
  paidDirect: boolean;
  paidMembers: Set<string>;
  batches: MockBatchRecord[];
  batchDetails: Map<string, PayoutBatchDetail>;
  nextReceipt: number;
};

const session: MockSession = {
  cutoff: now.toISOString(),
  paidDirect: false,
  paidMembers: new Set(),
  batches: seedBatches(),
  batchDetails: new Map(),
  nextReceipt: 3,
};

function seedBatches(): MockBatchRecord[] {
  return [
    {
      id: "pb-mock-1",
      label: "Trindalyn Mackenzie · direct sales through Jan 15, 2026",
      status: PAID_STATUS,
      periodStart: daysAgo(45),
      periodEnd: daysAgo(30),
      processedAt: daysAgo(30),
      createdAt: daysAgo(30),
      teamId: null,
      teamName: null,
      sponsorAffiliateId: MOCK_AFFILIATE_ID,
      sponsorName: TRINDALYN.displayName,
      entryCount: 98,
      affiliateCount: 1,
      totalAmount: 3_842.15,
    },
    {
      id: "pb-mock-2",
      label: "Trindalyn Mackenzie · Blair Rodgers · My downline through Dec 20, 2025",
      status: PAID_STATUS,
      periodStart: daysAgo(75),
      periodEnd: daysAgo(60),
      processedAt: daysAgo(58),
      createdAt: daysAgo(58),
      teamId: MOCK_TEAM_ID,
      teamName: "My downline",
      sponsorAffiliateId: MOCK_AFFILIATE_ID,
      sponsorName: TRINDALYN.displayName,
      entryCount: 142,
      affiliateCount: 1,
      totalAmount: 1_640.0,
    },
  ];
}

function memberTarget(memberId: string): PayoutTarget {
  return { scope: "member", teamId: MOCK_TEAM_ID, memberId };
}

function isTargetPaid(target: PayoutTarget): boolean {
  if (target.scope === "direct") return session.paidDirect;
  return session.paidMembers.has(payoutTargetKey(target));
}

function pricingFor(target: PayoutTarget): MockPricing | null {
  if (target.scope === "direct") return PRICING.direct;
  if (target.memberId === MOCK_BLAIR_ID) return PRICING.blair;
  return null;
}

function buildDraftEntries(
  target: PayoutTarget,
  pricing: MockPricing
): PayoutDraftEntry[] {
  const isDirect = target.scope === "direct";
  const show = Math.min(pricing.entryCount, PREVIEW_ENTRY_LIMIT);
  const amountEach = pricing.amount / pricing.entryCount;
  const revenueEach = pricing.revenue / pricing.entryCount;

  return Array.from({ length: show }, (_, index) => {
    const order = 8300 - index;
    return {
      id: `mock-draft-${payoutTargetKey(target)}-${index}`,
      occurredAt: daysAgo(index + 1),
      type: isDirect ? "DIRECT" : "OVERRIDE",
      description: isDirect
        ? `Order #${order}`
        : `Blair Rodgers · Order #${order}`,
      wooOrderId: order,
      orderRevenue: Math.round(revenueEach * 100) / 100,
      amount: Math.round(amountEach * 100) / 100,
      sourceAffiliateName: isDirect ? null : "Blair Rodgers",
    };
  });
}

function buildAllExportRows(
  target: PayoutTarget,
  pricing: MockPricing
): PayoutDraftEntry[] {
  const isDirect = target.scope === "direct";
  const amountEach = pricing.amount / pricing.entryCount;
  const revenueEach = pricing.revenue / pricing.entryCount;

  return Array.from({ length: pricing.entryCount }, (_, index) => {
    const order = 9000 - index;
    return {
      id: `mock-export-${payoutTargetKey(target)}-${index}`,
      occurredAt: daysAgo(Math.floor(index / 3) + 1),
      type: isDirect ? "DIRECT" : "OVERRIDE",
      description: isDirect
        ? `Order #${order}`
        : `Blair Rodgers · Order #${order}`,
      wooOrderId: order,
      orderRevenue: Math.round(revenueEach * 100) / 100,
      amount: Math.round(amountEach * 100) / 100,
      sourceAffiliateName: isDirect ? null : "Blair Rodgers",
    };
  });
}

export function mockAdminSearchAffiliates(q: string, limit: number) {
  const term = q.trim().toLowerCase();
  let items = SEARCHABLE;

  if (term.length >= 2) {
    items = SEARCHABLE.filter((affiliate) => {
      const haystack = [
        affiliate.displayName,
        affiliate.email,
        String(affiliate.slicewpId),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(term);
    });
  }

  return { items: items.slice(0, Math.min(50, Math.max(1, limit))) };
}

export function mockAdminAffiliateDetail(
  affiliateId: string
): AdminAffiliateDetail | null {
  const affiliate =
    affiliateId === MOCK_AFFILIATE_ID
      ? TRINDALYN
      : affiliateId === MOCK_JORDAN_ID
        ? JORDAN
        : null;
  if (!affiliate) return null;

  const unpaidDirect = session.paidDirect ? 0 : PRICING.direct.amount;
  const unpaidBlair = session.paidMembers.has(
    payoutTargetKey(memberTarget(MOCK_BLAIR_ID))
  )
    ? 0
    : PRICING.blair.amount;
  const unpaidTotal =
    affiliateId === MOCK_AFFILIATE_ID
      ? unpaidDirect + unpaidBlair + PRICING.unattributed.amount
      : 0;

  return {
    id: affiliate.id,
    slicewpId: affiliate.slicewpId,
    email: affiliate.email,
    paymentEmail: affiliate.email,
    displayName: affiliate.displayName,
    status: affiliate.status,
    commissionRate: affiliateId === MOCK_AFFILIATE_ID ? "30" : "25",
    syncedAt: daysAgo(0),
    profile: null,
    portal: {
      hasAccess: true,
      disabled: false,
      mustChangePassword: false,
      lastSignInAt: daysAgo(2),
      loginEmail: affiliate.email,
    },
    ledger: {
      unpaidTotal,
      unpaidCount:
        affiliateId === MOCK_AFFILIATE_ID
          ? PRICING.direct.entryCount +
            PRICING.blair.entryCount +
            PRICING.unattributed.entryCount
          : 0,
      paidTotal: 26_974.37,
      paidCount: 1_790,
      pendingTotal: 291.53,
      pendingCount: 18,
      rejectedTotal: 0,
      rejectedCount: 0,
      directUnpaidTotal: unpaidDirect,
      directUnpaidCount: session.paidDirect ? 0 : PRICING.direct.entryCount,
      overrideTotal: unpaidBlair,
      overrideCount: session.paidMembers.has(
        payoutTargetKey(memberTarget(MOCK_BLAIR_ID))
      )
        ? 0
        : PRICING.blair.entryCount,
    },
    dealRules: { asSponsor: [], asRecruit: [] },
  };
}

export function mockAdminAffiliateSync(affiliateId: string) {
  const affiliate = mockAdminAffiliateDetail(affiliateId);
  if (!affiliate) {
    throw new PayoutInputError("Affiliate not found");
  }

  session.cutoff = new Date().toISOString();

  return {
    affiliateId: affiliate.id,
    slicewpId: affiliate.slicewpId,
    displayName: affiliate.displayName,
    recruitsIncluded: affiliateId === MOCK_AFFILIATE_ID ? 4 : 0,
    commissionsUpserted: affiliateId === MOCK_AFFILIATE_ID ? 312 : 0,
  };
}

export function mockAdminPayoutOptions(affiliateId: string): PayoutOptions {
  const affiliate = mockAdminAffiliateDetail(affiliateId);
  if (!affiliate) {
    throw new PayoutInputError("Affiliate not found.");
  }

  session.cutoff = new Date().toISOString();

  if (affiliateId !== MOCK_AFFILIATE_ID) {
    return {
      affiliateId,
      affiliateName: affiliate.displayName ?? affiliate.email,
      cutoff: session.cutoff,
      direct: null,
      teams: [],
      unattributed: { amount: 0, entryCount: 0 },
    };
  }

  const directPaid = session.paidDirect;
  const blairPaid = session.paidMembers.has(
    payoutTargetKey(memberTarget(MOCK_BLAIR_ID))
  );

  const blairOption = !blairPaid
    ? {
        key: payoutTargetKey(memberTarget(MOCK_BLAIR_ID)),
        target: memberTarget(MOCK_BLAIR_ID),
        label: "Blair Rodgers",
        sublabel: `${PRICING.blair.entryCount.toLocaleString("en-US")} sales`,
        math: PRICING.blair.math,
        amount: PRICING.blair.amount,
        entryCount: PRICING.blair.entryCount,
        revenue: PRICING.blair.revenue,
      }
    : null;

  const teamMembers = blairOption ? [blairOption] : [];

  return {
    affiliateId,
    affiliateName: affiliate.displayName ?? affiliate.email,
    cutoff: session.cutoff,
    direct: directPaid
      ? null
      : {
          key: "direct",
          target: { scope: "direct" },
          label: "Direct sales",
          sublabel: `Their own commissions · ${PRICING.direct.entryCount.toLocaleString("en-US")} sales`,
          math: PRICING.direct.math,
          amount: PRICING.direct.amount,
          entryCount: PRICING.direct.entryCount,
          revenue: PRICING.direct.revenue,
        },
    teams:
      teamMembers.length > 0
        ? [
            {
              teamId: MOCK_TEAM_ID,
              label: "My downline",
              sublabel: `${teamMembers.length.toLocaleString("en-US")} member to pay`,
              amount: teamMembers.reduce((sum, member) => sum + member.amount, 0),
              entryCount: teamMembers.reduce(
                (sum, member) => sum + member.entryCount,
                0
              ),
              revenue: teamMembers.reduce(
                (sum, member) => sum + member.revenue,
                0
              ),
              members: teamMembers,
            },
          ]
        : [],
    unattributed:
      affiliateId === MOCK_AFFILIATE_ID
        ? PRICING.unattributed
        : { amount: 0, entryCount: 0 },
  };
}

export function mockAdminPayoutPreview(
  selection: PayoutSelection
): PayoutDraft {
  const affiliate = mockAdminAffiliateDetail(selection.affiliateId);
  if (!affiliate) {
    throw new PayoutInputError("Affiliate not found.");
  }

  const pricing = pricingFor(selection.target);
  if (!pricing || isTargetPaid(selection.target)) {
    return {
      affiliateId: selection.affiliateId,
      affiliateName: affiliate.displayName ?? affiliate.email,
      target: selection.target,
      targetLabel:
        selection.target.scope === "direct"
          ? "direct sales"
          : "Blair Rodgers · My downline",
      cutoff: selection.cutoff.toISOString(),
      entryCount: 0,
      totalAmount: 0,
      revenueTotal: 0,
      oldestOccurredAt: null,
      newestOccurredAt: null,
      entries: [],
      entriesTruncated: false,
    };
  }

  const entries = buildDraftEntries(selection.target, pricing);

  return {
    affiliateId: selection.affiliateId,
    affiliateName: affiliate.displayName ?? affiliate.email,
    target: selection.target,
    targetLabel:
      selection.target.scope === "direct"
        ? "direct sales"
        : "Blair Rodgers · My downline",
    cutoff: selection.cutoff.toISOString(),
    entryCount: pricing.entryCount,
    totalAmount: pricing.amount,
    revenueTotal: pricing.revenue,
    oldestOccurredAt: daysAgo(pricing.entryCount),
    newestOccurredAt: daysAgo(1),
    entries,
    entriesTruncated: pricing.entryCount > entries.length,
  };
}

export function mockAdminCreatePayout(
  selection: PayoutSelection,
  expected?: { entryCount: number; totalAmount: number }
): CreatedPayout {
  const draft = mockAdminPayoutPreview(selection);
  if (draft.entryCount === 0) {
    throw new PayoutInputError(
      "Nothing unpaid matches this selection any more."
    );
  }

  if (
    expected &&
    (expected.entryCount !== draft.entryCount ||
      Math.round(expected.totalAmount * 100) !==
        Math.round(draft.totalAmount * 100))
  ) {
    throw new PayoutConflictError(
      "The unpaid total changed while you were reviewing it.",
      {
        entryCount: draft.entryCount,
        totalAmount: draft.totalAmount,
      }
    );
  }

  const processedAt = new Date().toISOString();
  const batchId = `pb-mock-${session.nextReceipt++}`;
  const label = draft.targetLabel.includes("direct")
    ? `${draft.affiliateName} · direct sales through ${new Date(selection.cutoff).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`
    : `${draft.affiliateName} · Blair Rodgers · My downline through ${new Date(selection.cutoff).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}`;

  if (selection.target.scope === "direct") {
    session.paidDirect = true;
  } else {
    session.paidMembers.add(payoutTargetKey(selection.target));
  }

  const row: MockBatchRecord = {
    id: batchId,
    label,
    status: PAID_STATUS,
    periodStart: draft.oldestOccurredAt ?? processedAt,
    periodEnd: selection.cutoff.toISOString(),
    processedAt,
    createdAt: processedAt,
    teamId:
      selection.target.scope === "member" ? selection.target.teamId : null,
    teamName: selection.target.scope === "member" ? "My downline" : null,
    sponsorAffiliateId: selection.affiliateId,
    sponsorName: draft.affiliateName,
    entryCount: draft.entryCount,
    affiliateCount: 1,
    totalAmount: draft.totalAmount,
  };

  session.batches.unshift(row);

  const exportEntries = buildAllExportRows(selection.target, pricingFor(selection.target)!);
  const directTotal = exportEntries
    .filter((entry) => entry.type === "DIRECT")
    .reduce((sum, entry) => sum + entry.amount, 0);
  const overrideTotal = exportEntries
    .filter((entry) => entry.type === "OVERRIDE")
    .reduce((sum, entry) => sum + entry.amount, 0);

  session.batchDetails.set(batchId, {
    id: batchId,
    label,
    status: PAID_STATUS,
    periodStart: row.periodStart,
    periodEnd: row.periodEnd,
    processedAt,
    createdAt: processedAt,
    teamId: row.teamId,
    teamName: row.teamName,
    sponsorAffiliateId: selection.affiliateId,
    totals: {
      grandTotal: draft.totalAmount,
      directTotal,
      overrideTotal,
      otherTotal: 0,
      entryCount: draft.entryCount,
    },
    items: [
      {
        affiliateId: selection.affiliateId,
        displayName: TRINDALYN.displayName,
        email: TRINDALYN.email,
        totalAmount: draft.totalAmount,
        entryCount: draft.entryCount,
        directTotal,
        overrideTotal,
      },
    ],
    recruitBreakdown:
      selection.target.scope === "member"
        ? [
            {
              sourceAffiliateId: MOCK_BLAIR_ID,
              displayName: "Blair Rodgers",
              email: "blair@example.com",
              overrideTotal: draft.totalAmount,
              overrideCount: draft.entryCount,
              sourceRevenue: draft.revenueTotal,
            },
          ]
        : [],
    entries: exportEntries.slice(0, 100).map((entry) => ({
      id: entry.id,
      type: entry.type,
      amount: entry.amount,
      status: PAID_STATUS,
      description: entry.description,
      wooOrderId: entry.wooOrderId,
      orderRevenue: entry.orderRevenue,
      occurredAt: entry.occurredAt,
      sourceAffiliate:
        entry.sourceAffiliateName && selection.target.scope === "member"
          ? {
              id: MOCK_BLAIR_ID,
              displayName: "Blair Rodgers",
              email: "blair@example.com",
            }
          : null,
      dealRule:
        entry.type === "OVERRIDE"
          ? { id: "mock-rule-1", name: "Team override" }
          : null,
    })),
  });

  return {
    batchId,
    label,
    entryCount: draft.entryCount,
    totalAmount: draft.totalAmount,
    processedAt,
  };
}

export function mockAdminPayoutExport(selection: PayoutSelection): string {
  const pricing = pricingFor(selection.target);
  if (!pricing || isTargetPaid(selection.target)) {
    return "Sale date,Type,Member,Order,Sale amount,Rate,Earned,Description\n";
  }

  const rows = buildAllExportRows(selection.target, pricing).map((entry) => {
    const revenue = entry.orderRevenue ?? 0;
    const rate =
      revenue > 0
        ? `${((entry.amount / revenue) * 100).toFixed(2)}%`
        : "";
    return [
      entry.occurredAt.slice(0, 10),
      entry.type === "OVERRIDE" ? "Team earnings" : "Direct",
      entry.sourceAffiliateName ?? "",
      entry.wooOrderId ? `#${entry.wooOrderId}` : "",
      revenue ? revenue.toFixed(2) : "",
      rate,
      entry.amount.toFixed(2),
      entry.description ?? "",
    ]
      .map((cell) =>
        /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
      )
      .join(",");
  });

  return [
    "Sale date,Type,Member,Order,Sale amount,Rate,Earned,Description",
    ...rows,
  ].join("\n");
}

export function mockAdminPayoutBatches(sponsorAffiliateId?: string | null) {
  const batches: PayoutBatchRow[] = (sponsorAffiliateId
    ? session.batches.filter(
        (batch) => batch.sponsorAffiliateId === sponsorAffiliateId
      )
    : session.batches
  ).map(toPayoutBatchRow);
  return { batches };
}

export function mockAdminPayoutBatchDetail(
  batchId: string
): { batch: PayoutBatchDetail } | null {
  const detail = session.batchDetails.get(batchId);
  if (detail) return { batch: detail };

  const summary = session.batches.find((batch) => batch.id === batchId);
  if (!summary) return null;

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
      sponsorAffiliateId: summary.sponsorAffiliateId ?? null,
      totals: {
        grandTotal: summary.totalAmount,
        directTotal: summary.teamId ? 0 : summary.totalAmount,
        overrideTotal: summary.teamId ? summary.totalAmount : 0,
        otherTotal: 0,
        entryCount: summary.entryCount,
      },
      items: [
        {
          affiliateId: summary.sponsorAffiliateId ?? MOCK_AFFILIATE_ID,
          displayName: summary.sponsorName ?? null,
          email: TRINDALYN.email,
          totalAmount: summary.totalAmount,
          entryCount: summary.entryCount,
          directTotal: summary.teamId ? 0 : summary.totalAmount,
          overrideTotal: summary.teamId ? summary.totalAmount : 0,
        },
      ],
      recruitBreakdown: summary.teamId
        ? [
            {
              sourceAffiliateId: MOCK_BLAIR_ID,
              displayName: "Blair Rodgers",
              email: "blair@example.com",
              overrideTotal: summary.totalAmount,
              overrideCount: summary.entryCount,
              sourceRevenue: PRICING.blair.revenue,
            },
          ]
        : [],
      entries: [],
    },
  };
}

/** Reset in-memory payout state — useful when hot-reloading gets confusing. */
export function resetAdminMockSession() {
  session.cutoff = new Date().toISOString();
  session.paidDirect = false;
  session.paidMembers.clear();
  session.batches = seedBatches();
  session.batchDetails.clear();
  session.nextReceipt = 3;
}
