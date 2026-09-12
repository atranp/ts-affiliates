import { LedgerEntryType, type Commission, type LedgerEntry } from "@prisma/client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { isLifetimeSaleType } from "@/lib/affiliate/lifetime";
import {
  type AttributionAudit,
  type CommissionJourneyCustomer,
  type CommissionJourneyOrder,
  type CommissionJourneyPayload,
  commissionCookieNoClickHeadline,
  commissionOverrideWhyHeadline,
  commissionWhyHeadline,
  isWinningRule,
  type JourneyStep,
  type WinningRule,
} from "@/lib/ledger/attribution-audit";
import { orderTotalsFromJourneyOrder } from "@/lib/sync-journey";
import { fetchCommissionJourney } from "@/lib/slicewp-bridge";
import { resolveTrackedByClick } from "@/lib/ledger/attribution";
import { prisma } from "@/lib/prisma";
import { formatAppDate } from "@/lib/timezone";
import { toNumber } from "@/lib/utils";

export type CommissionDetailEntry = {
  id: string;
  type: string;
  amount: string;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: string | null;
  occurredAt: string;
  payoutWeek: string | null;
  paidAt: string | null;
  trackedByClick: boolean | null;
  isLifetimeSale: boolean;
};

export type CommissionDetailWhy = {
  rule: WinningRule | "override";
  headline: string;
  detail: string | null;
};

export type CommissionDetailOrder = {
  id: number;
  /** SliceWP reference_amount — commission rate applies here. */
  commissionBase: string;
  shipping: string | null;
  tax: string | null;
  orderTotal: string | null;
  date: string;
  coupons: string[];
};

export type CommissionDetailCustomer = {
  label: string;
  orderIndex: number | null;
  totalOrders: number | null;
  firstOrderId: number | null;
  firstLinkedAt: string | null;
};

export type CommissionDetailPayout = {
  status: string;
  batchLabel: string | null;
  paidAt: string | null;
};

export type CommissionDetailResponse = {
  entry: CommissionDetailEntry;
  why: CommissionDetailWhy;
  order: CommissionDetailOrder | null;
  customer: CommissionDetailCustomer | null;
  journey: JourneyStep[];
  payout: CommissionDetailPayout | null;
};

type LoadedVisit = {
  occurredAt: Date;
  landingUrl: string | null;
  referrerUrl: string | null;
};

type LoadedOrderAttribution = {
  referrerVisitSlicewpId: number | null;
  couponCodes: string[];
  sessionEntryHost: string | null;
  orderSubtotal: number | null;
  orderShipping: number | null;
  orderTax: number | null;
  orderTotal: number | null;
};

type DetailBuildContext = {
  entry: LedgerEntry & {
    sourceAffiliate?: { displayName: string | null; email: string } | null;
    payoutBatch?: { label: string; status: string } | null;
  };
  commission: Commission | null;
  visit: LoadedVisit | null;
  orderAttribution: LoadedOrderAttribution | null;
  audit: AttributionAudit | null;
  trackedByClick: boolean;
  isLifetimeSale: boolean;
  customerOrderIndex: number | null;
  customerTotalOrders: number | null;
  firstOrderId: number | null;
  firstLinkedAt: string | null;
};

function parseAttributionAudit(value: unknown): AttributionAudit | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  if ("syncedWithoutAudit" in value) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    typeof record.winningRule !== "string" ||
    !isWinningRule(record.winningRule)
  ) {
    return null;
  }

  return value as AttributionAudit;
}

function iso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function money(value: unknown): string {
  if (value === null || value === undefined) return "0";
  return toNumber(value).toFixed(2);
}

function serializeEntry(ctx: DetailBuildContext): CommissionDetailEntry {
  const { entry, trackedByClick, isLifetimeSale } = ctx;

  return {
    id: entry.id,
    type: entry.type,
    amount: money(entry.amount),
    status: entry.status,
    description: entry.description,
    wooOrderId: entry.wooOrderId,
    orderRevenue:
      entry.orderRevenue === null || entry.orderRevenue === undefined
        ? null
        : money(entry.orderRevenue),
    occurredAt: iso(entry.occurredAt)!,
    payoutWeek: iso(entry.payoutWeek),
    paidAt: iso(entry.paidAt),
    trackedByClick,
    isLifetimeSale,
  };
}

function buildWhy(ctx: DetailBuildContext): CommissionDetailWhy {
  const { entry, audit, trackedByClick, isLifetimeSale, visit } = ctx;

  if (entry.type === LedgerEntryType.OVERRIDE) {
    const recruit =
      entry.sourceAffiliate?.displayName ??
      entry.sourceAffiliate?.email ??
      "Team member";
    return {
      rule: "override",
      headline: commissionOverrideWhyHeadline(
        recruit,
        entry.wooOrderId ?? 0
      ),
      detail: null,
    };
  }

  let rule: WinningRule =
    audit?.winningRule ??
    (isLifetimeSale ? "lifetime" : trackedByClick ? "link" : "none");

  let headline: string;

  if (
    rule === "link" &&
    !trackedByClick &&
    ctx.orderAttribution?.referrerVisitSlicewpId
  ) {
    headline = commissionCookieNoClickHeadline();
  } else if (rule === "coupon") {
    headline = commissionWhyHeadline("coupon", {
      couponCode: audit?.order.coupons[0] ?? ctx.orderAttribution?.couponCodes[0],
    });
  } else if (rule === "link") {
    headline = commissionWhyHeadline("link", { hasVisitRow: visit !== null });
  } else if (rule === "lifetime" || isLifetimeSale) {
    rule = "lifetime";
    headline = commissionWhyHeadline("lifetime");
  } else {
    headline = commissionWhyHeadline("none");
  }

  return { rule, headline, detail: null };
}

function buildCustomer(ctx: DetailBuildContext): CommissionDetailCustomer | null {
  if (ctx.entry.type === LedgerEntryType.OVERRIDE) return null;

  const copy = AFFILIATE_COPY.commissions.detail.customer;
  const {
    customerOrderIndex,
    customerTotalOrders,
    isLifetimeSale,
    firstOrderId,
    firstLinkedAt,
  } = ctx;

  if (
    customerOrderIndex !== null &&
    customerTotalOrders !== null &&
    customerTotalOrders > 0
  ) {
    return {
      label: copy.linked(customerOrderIndex, customerTotalOrders),
      orderIndex: customerOrderIndex,
      totalOrders: customerTotalOrders,
      firstOrderId,
      firstLinkedAt,
    };
  }

  if (isLifetimeSale && firstOrderId && firstLinkedAt) {
    const index = customerOrderIndex ?? 1;
    const total = customerTotalOrders ?? 1;
    return {
      label: copy.linked(index, total),
      orderIndex: index,
      totalOrders: total,
      firstOrderId,
      firstLinkedAt,
    };
  }

  if (isLifetimeSale) {
    return {
      label: copy.linked(1, 1),
      orderIndex: 1,
      totalOrders: 1,
      firstOrderId: ctx.entry.wooOrderId,
      firstLinkedAt: iso(ctx.entry.occurredAt),
    };
  }

  return {
    label: copy.newCustomer,
    orderIndex: null,
    totalOrders: null,
    firstOrderId: null,
    firstLinkedAt: null,
  };
}

function buildOrder(ctx: DetailBuildContext): CommissionDetailOrder | null {
  const orderId = ctx.entry.wooOrderId;
  if (orderId === null) return null;

  const coupons =
    ctx.audit?.order.coupons ??
    ctx.orderAttribution?.couponCodes ??
    [];

  // Not the Woo subtotal: that is pre-discount, and the rate is applied to the
  // order less shipping and tax.
  const commissionBase = ctx.entry.commissionBase ?? ctx.entry.orderRevenue;

  return {
    id: orderId,
    commissionBase: money(commissionBase),
    shipping:
      ctx.orderAttribution?.orderShipping != null
        ? money(ctx.orderAttribution.orderShipping)
        : null,
    tax:
      ctx.orderAttribution?.orderTax != null
        ? money(ctx.orderAttribution.orderTax)
        : null,
    orderTotal:
      ctx.orderAttribution?.orderTotal != null
        ? money(ctx.orderAttribution.orderTotal)
        : null,
    date: formatAppDate(ctx.entry.occurredAt),
    coupons,
  };
}

function shouldShowFirstLinkedStep(ctx: DetailBuildContext): boolean {
  if (!ctx.firstOrderId || !ctx.firstLinkedAt) return false;
  if (ctx.isLifetimeSale) return true;
  return (
    ctx.customerTotalOrders !== null &&
    ctx.customerTotalOrders > 1 &&
    ctx.customerOrderIndex !== null
  );
}

function buildJourney(ctx: DetailBuildContext): JourneyStep[] {
  if (ctx.entry.type === LedgerEntryType.OVERRIDE) return [];

  const copy = AFFILIATE_COPY.commissions.detail.journey;
  const steps: JourneyStep[] = [];

  if (shouldShowFirstLinkedStep(ctx)) {
    steps.push({
      kind: "customer_linked",
      label: copy.firstLinked(
        formatAppDate(ctx.firstLinkedAt!),
        ctx.firstOrderId!
      ),
      at: ctx.firstLinkedAt!,
      meta: { orderId: String(ctx.firstOrderId) },
    });
  }

  if (ctx.visit) {
    steps.push({
      kind: "click",
      label: copy.click,
      at: ctx.visit.occurredAt.toISOString(),
      meta: ctx.visit.landingUrl
        ? { landing: ctx.visit.landingUrl }
        : undefined,
    });
  } else if (
    ctx.orderAttribution?.referrerVisitSlicewpId &&
    ctx.orderAttribution.referrerVisitSlicewpId > 0
  ) {
    steps.push({
      kind: "cookie",
      label: copy.cookie,
      at: ctx.entry.occurredAt.toISOString(),
    });
  }

  const coupons =
    ctx.audit?.order.coupons ??
    ctx.orderAttribution?.couponCodes ??
    [];

  if (coupons.length > 0) {
    steps.push({
      kind: "coupon",
      label: copy.coupon,
      at: ctx.entry.occurredAt.toISOString(),
      meta: { code: coupons.join(", ") },
    });
  }

  if (ctx.orderAttribution?.sessionEntryHost) {
    steps.push({
      kind: "email",
      label: copy.email,
      at: ctx.entry.occurredAt.toISOString(),
      meta: { source: ctx.orderAttribution.sessionEntryHost },
    });
  }

  if (ctx.entry.wooOrderId !== null) {
    steps.push({
      kind: "order",
      label: copy.order,
      at: ctx.entry.occurredAt.toISOString(),
      meta: { orderId: String(ctx.entry.wooOrderId) },
    });
  }

  steps.push({
    kind: "commission",
    label: copy.commission,
    at: ctx.entry.occurredAt.toISOString(),
  });

  if (ctx.entry.paidAt) {
    steps.push({
      kind: "payout",
      label: copy.payout,
      at: ctx.entry.paidAt.toISOString(),
    });
  }

  return steps.sort(
    (a, b) => new Date(a.at).getTime() - new Date(b.at).getTime()
  );
}

function buildPayout(ctx: DetailBuildContext): CommissionDetailPayout | null {
  const copy = AFFILIATE_COPY.commissions.detail.payout;

  if (ctx.entry.status === "PAID" && ctx.entry.paidAt) {
    return {
      status: copy.paid(formatAppDate(ctx.entry.paidAt)),
      batchLabel: ctx.entry.payoutBatch?.label ?? null,
      paidAt: iso(ctx.entry.paidAt),
    };
  }

  if (ctx.entry.status === "PENDING") {
    return {
      status: copy.awaitingMilestone,
      batchLabel: null,
      paidAt: null,
    };
  }

  return {
    status: copy.pending,
    batchLabel: ctx.entry.payoutBatch?.label ?? null,
    paidAt: null,
  };
}

export function buildCommissionDetailResponse(
  ctx: DetailBuildContext
): CommissionDetailResponse {
  return {
    entry: serializeEntry(ctx),
    why: buildWhy(ctx),
    order: buildOrder(ctx),
    customer: buildCustomer(ctx),
    journey: buildJourney(ctx),
    payout: buildPayout(ctx),
  };
}

function orderAttributionFromRow(row: {
  referrerVisitSlicewpId: number | null;
  couponCodes: string[];
  sessionEntryHost: string | null;
  orderSubtotal: { toString(): string } | null;
  orderShipping: { toString(): string } | null;
  orderTax: { toString(): string } | null;
  orderTotal: { toString(): string } | null;
}): LoadedOrderAttribution {
  return {
    referrerVisitSlicewpId: row.referrerVisitSlicewpId,
    couponCodes: row.couponCodes,
    sessionEntryHost: row.sessionEntryHost,
    orderSubtotal:
      row.orderSubtotal === null ? null : toNumber(row.orderSubtotal),
    orderShipping:
      row.orderShipping === null ? null : toNumber(row.orderShipping),
    orderTax: row.orderTax === null ? null : toNumber(row.orderTax),
    orderTotal: row.orderTotal === null ? null : toNumber(row.orderTotal),
  };
}

const ORDER_ATTRIBUTION_SELECT = {
  referrerVisitSlicewpId: true,
  couponCodes: true,
  sessionEntryHost: true,
  orderSubtotal: true,
  orderShipping: true,
  orderTax: true,
  orderTotal: true,
} as const;

function orderAttributionNeedsRefresh(
  row: {
    orderSubtotal: unknown;
    orderShipping: unknown;
    orderTax: unknown;
    orderTotal: unknown;
  } | null
): boolean {
  return (
    row?.orderSubtotal == null ||
    row.orderTotal == null ||
    row.orderShipping == null ||
    row.orderTax == null
  );
}

async function persistOrderAttributionTotals(
  wooOrderId: number,
  journeyOrder: CommissionJourneyOrder
): Promise<LoadedOrderAttribution | null> {
  const totals = orderTotalsFromJourneyOrder(journeyOrder);
  const row = await prisma.orderAttribution.upsert({
    where: { wooOrderId },
    create: {
      wooOrderId,
      couponCodes: journeyOrder.coupons,
      referrerAffiliateSlicewpId: null,
      referrerVisitSlicewpId: null,
      sessionEntryHost: null,
      ...totals,
    },
    update: totals,
    select: ORDER_ATTRIBUTION_SELECT,
  });

  return orderAttributionFromRow(row);
}

async function loadOrderAttribution(
  wooOrderId: number,
  journeyOrder: CommissionJourneyOrder | null | undefined
): Promise<LoadedOrderAttribution | null> {
  const row = await prisma.orderAttribution.findUnique({
    where: { wooOrderId },
    select: ORDER_ATTRIBUTION_SELECT,
  });

  if (journeyOrder && orderAttributionNeedsRefresh(row)) {
    try {
      return await persistOrderAttributionTotals(wooOrderId, journeyOrder);
    } catch {
      // Drawer still works with commission base only.
    }
  }

  if (!row) return null;

  return orderAttributionFromRow(row);
}

export async function resolveCustomerHistory(params: {
  affiliateId: string;
  customerSlicewpId: number | null;
  wooOrderId: number | null;
  journeyCustomer: CommissionJourneyCustomer | null | undefined;
}): Promise<{
  orderIndex: number | null;
  totalOrders: number | null;
  firstOrderId: number | null;
  firstLinkedAt: string | null;
}> {
  const { affiliateId, customerSlicewpId, wooOrderId, journeyCustomer } =
    params;

  if (wooOrderId === null) {
    return {
      orderIndex: null,
      totalOrders: null,
      firstOrderId: null,
      firstLinkedAt: null,
    };
  }

  const effectiveCustomerId =
    customerSlicewpId ?? journeyCustomer?.slicewpId ?? null;

  const firstOrderId = journeyCustomer?.firstOrderId ?? null;
  const firstLinkedAt = journeyCustomer?.firstCommissionDate ?? null;
  const totalOrdersFromBridge =
    journeyCustomer && journeyCustomer.orderCount > 0
      ? journeyCustomer.orderCount
      : null;

  if (effectiveCustomerId === null && firstOrderId === null) {
    return {
      orderIndex: null,
      totalOrders: null,
      firstOrderId: null,
      firstLinkedAt: null,
    };
  }

  const rows = await prisma.commission.findMany({
    where: {
      affiliateId,
      wooOrderId: { not: null },
      OR: [
        ...(effectiveCustomerId !== null
          ? [{ customerSlicewpId: effectiveCustomerId }]
          : []),
        ...(firstOrderId !== null ? [{ wooOrderId: firstOrderId }] : []),
      ],
    },
    orderBy: { dateCreated: "asc" },
    select: { wooOrderId: true },
  });

  const seen = new Set<number>();
  const orderedOrderIds = rows
    .map((row) => row.wooOrderId)
    .filter((id): id is number => {
      if (id === null || seen.has(id)) return false;
      seen.add(id);
      return true;
    });

  const orderIndex =
    orderedOrderIds.findIndex((id) => id === wooOrderId) + 1;

  return {
    orderIndex: orderIndex > 0 ? orderIndex : null,
    totalOrders: totalOrdersFromBridge ?? (orderedOrderIds.length || null),
    firstOrderId,
    firstLinkedAt,
  };
}

export async function getCommissionDetailForEntry(
  entryId: string,
  affiliateId: string
): Promise<CommissionDetailResponse | null> {
  const entry = await prisma.ledgerEntry.findFirst({
    where: { id: entryId, affiliateId },
    include: {
      sourceAffiliate: {
        select: { displayName: true, email: true },
      },
      payoutBatch: {
        select: { label: true, status: true },
      },
    },
  });

  if (!entry) return null;

  const commission =
    entry.slicewpCommissionId !== null
      ? await prisma.commission.findFirst({
          where: {
            slicewpId: entry.slicewpCommissionId,
            affiliateId,
          },
        })
      : null;

  let journey: CommissionJourneyPayload | null = null;
  if (entry.slicewpCommissionId !== null) {
    try {
      journey = await fetchCommissionJourney(entry.slicewpCommissionId, {
        lite: true,
      });
    } catch {
      // Detail still works from synced Supabase rows.
    }
  }

  const visitSlicewpId =
    commission?.visitSlicewpId ?? journey?.commission.visitId ?? null;
  let visit =
    visitSlicewpId !== null
      ? await prisma.visit.findFirst({
          where: { affiliateId, slicewpId: visitSlicewpId },
          select: {
            occurredAt: true,
            landingUrl: true,
            referrerUrl: true,
          },
        })
      : entry.slicewpCommissionId !== null
        ? await prisma.visit.findFirst({
            where: {
              affiliateId,
              slicewpCommissionId: entry.slicewpCommissionId,
            },
            select: {
              occurredAt: true,
              landingUrl: true,
              referrerUrl: true,
            },
          })
        : null;

  if (!visit && journey?.visit) {
    visit = {
      occurredAt: new Date(journey.visit.occurredAt),
      landingUrl: journey.visit.landingUrl,
      referrerUrl: journey.visit.referrerUrl,
    };
  }

  const orderAttribution =
    entry.wooOrderId !== null
      ? await loadOrderAttribution(entry.wooOrderId, journey?.order)
      : null;

  const audit = parseAttributionAudit(commission?.attributionAudit);

  const visitLinkedCommissionIds = new Set<number>();
  if (entry.slicewpCommissionId !== null && visit) {
    visitLinkedCommissionIds.add(entry.slicewpCommissionId);
  }

  const orderReferrerVisitByOrderId = new Map<number, number>();
  if (entry.wooOrderId !== null && orderAttribution?.referrerVisitSlicewpId) {
    orderReferrerVisitByOrderId.set(
      entry.wooOrderId,
      orderAttribution.referrerVisitSlicewpId
    );
  }

  const isLifetimeSale = isLifetimeSaleType(commission?.type ?? null);
  const trackedByClick = resolveTrackedByClick({
    slicewpCommissionId: entry.slicewpCommissionId,
    visitLinkedCommissionIds,
    visitSlicewpId,
    wooOrderId: entry.wooOrderId,
    orderReferrerVisitByOrderId,
  });

  const { orderIndex, totalOrders, firstOrderId, firstLinkedAt } =
    await resolveCustomerHistory({
      affiliateId,
      customerSlicewpId:
        commission?.customerSlicewpId ??
        journey?.commission.customerId ??
        null,
      wooOrderId: entry.wooOrderId,
      journeyCustomer: journey?.customer,
    });

  return buildCommissionDetailResponse({
    entry,
    commission,
    visit,
    orderAttribution,
    audit,
    trackedByClick,
    isLifetimeSale,
    customerOrderIndex: orderIndex,
    customerTotalOrders: totalOrders,
    firstOrderId,
    firstLinkedAt,
  });
}
