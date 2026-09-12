import { Prisma, type Commission } from "@prisma/client";
import {
  type AttributionAudit,
  type CommissionJourneyPayload,
  isWinningRule,
} from "@/lib/ledger/attribution-audit";
import { prisma } from "@/lib/prisma";
import { commissionBaseFrom } from "@/lib/revenue";
import {
  BridgeUnavailableError,
  fetchCommissionJourney,
  isBridgeAvailable,
} from "@/lib/slicewp-bridge";

/** Aligned with COMMISSION-JOURNEY-PLAN backfill window. */
export const JOURNEY_SYNC_SINCE = new Date("2026-08-18T00:00:00.000Z");

/** Cap bridge calls per sync run — avoids serverless timeouts on full sync. */
const JOURNEY_ENRICH_PER_SYNC = 75;

export const JOURNEY_FETCH_CONCURRENCY = 4;

export type JourneyDisagreement = {
  commissionSlicewpId: number;
  wooOrderId: number | null;
  paidAffiliateSlicewpId: number;
  auditPaidAffiliateId: number;
  winningRule: string;
  commissionType: string;
  reason: "paid_affiliate_mismatch";
};

export type JourneyPendingFilter = {
  since?: Date;
  affiliateSlicewpId?: number;
  limit?: number;
  /**
   * - `missing-rule` — prod backfill default; any row still missing winningRule
   * - `unattempted` — skip rows already touched (incl. syncedWithoutAudit)
   * - `sync` — same as post-sync enrich (missing rule OR null audit)
   */
  mode?:
    | "missing-rule"
    | "unattempted"
    | "sync"
    | "missing-customer-id"
    | "missing-order-totals";
};

export function journeyPendingWhere(
  filter: JourneyPendingFilter = {}
): Prisma.CommissionWhereInput {
  const since = filter.since ?? JOURNEY_SYNC_SINCE;
  const mode = filter.mode ?? "sync";

  const where: Prisma.CommissionWhereInput = {
    wooOrderId: { not: null },
    origin: "woo",
    NOT: { type: { equals: "inherit", mode: "insensitive" } },
  };

  if (mode !== "missing-customer-id" && mode !== "missing-order-totals") {
    where.dateCreated = { gte: since };
  }

  if (mode === "missing-rule") {
    where.winningRule = null;
  } else if (mode === "unattempted") {
    where.attributionAudit = { equals: Prisma.DbNull };
  } else if (mode === "missing-customer-id") {
    where.customerSlicewpId = null;
  } else if (mode === "missing-order-totals") {
    // The commissionable base is order total less shipping and tax, so a sale
    // whose order was never fetched has no base and falls back to gross.
    where.commissionBase = null;
    where.orderRevenue = { not: null };
  } else {
    where.OR = [
      { winningRule: null },
      { attributionAudit: { equals: Prisma.DbNull } },
    ];
  }

  if (filter.affiliateSlicewpId) {
    where.affiliate = { slicewpId: filter.affiliateSlicewpId };
  }

  return where;
}

export function detectJourneyDisagreement(params: {
  commissionSlicewpId: number;
  wooOrderId: number | null;
  paidAffiliateSlicewpId: number;
  audit: AttributionAudit | null;
}): JourneyDisagreement | null {
  const { audit, paidAffiliateSlicewpId } = params;

  if (!audit || audit.paidAffiliateId === paidAffiliateSlicewpId) {
    return null;
  }

  return {
    commissionSlicewpId: params.commissionSlicewpId,
    wooOrderId: params.wooOrderId,
    paidAffiliateSlicewpId,
    auditPaidAffiliateId: audit.paidAffiliateId,
    winningRule: audit.winningRule,
    commissionType: audit.commissionType,
    reason: "paid_affiliate_mismatch",
  };
}

export type JourneyEnrichResult = {
  enriched: number;
  bridgeAvailable: boolean;
  pendingRemaining: number;
};

function positiveInt(value: number | string | undefined | null): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function visitAndCustomerFromRemote(remote: {
  visit_id?: number | string;
  customer_id?: number | string;
}): {
  visitSlicewpId: number | null;
  customerSlicewpId: number | null;
} {
  return {
    visitSlicewpId: positiveInt(remote.visit_id),
    customerSlicewpId: positiveInt(remote.customer_id),
  };
}

function decimalOrNull(value: string | undefined): number | null {
  if (value === undefined || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function orderTotalsFromJourneyOrder(
  order: CommissionJourneyPayload["order"]
): {
  orderSubtotal: number | null;
  orderShipping: number | null;
  orderTax: number | null;
  orderTotal: number | null;
} {
  if (!order) {
    return {
      orderSubtotal: null,
      orderShipping: null,
      orderTax: null,
      orderTotal: null,
    };
  }

  return {
    orderSubtotal: decimalOrNull(order.subtotal),
    orderShipping: decimalOrNull(order.shippingTotal),
    orderTax: decimalOrNull(order.taxTotal),
    orderTotal: decimalOrNull(order.total),
  };
}

export async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function runWorker() {
    while (index < items.length) {
      const current = index++;
      results[current] = await worker(items[current]!);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => runWorker())
  );

  return results;
}

function orderAttributionFromAudit(
  audit: AttributionAudit | null,
  fallbackCoupons: string[] | undefined
) {
  if (!audit) {
    return {
      referrerAffiliateSlicewpId: null as number | null,
      referrerVisitSlicewpId: null as number | null,
      couponCodes: fallbackCoupons ?? [],
      sessionEntryHost: null as string | null,
      attributionAudit: undefined as Prisma.InputJsonValue | undefined,
    };
  }

  return {
    referrerAffiliateSlicewpId:
      audit.order.referrerMeta.affiliateId > 0
        ? audit.order.referrerMeta.affiliateId
        : null,
    referrerVisitSlicewpId:
      audit.order.referrerMeta.visitId > 0
        ? audit.order.referrerMeta.visitId
        : null,
    couponCodes: audit.order.coupons.length
      ? audit.order.coupons
      : (fallbackCoupons ?? []),
    sessionEntryHost: audit.order.sessionEntryHost,
    attributionAudit: audit as Prisma.InputJsonValue,
  };
}

export async function applyJourneyToCommission(
  commission: Commission,
  journey?: CommissionJourneyPayload
): Promise<boolean> {
  const payload =
    journey ?? (await fetchCommissionJourney(commission.slicewpId, { lite: true }));
  const audit = payload.audit;
  const orderAttribution = orderAttributionFromAudit(
    audit,
    payload.order?.coupons
  );

  let commissionBase: number | null | undefined;

  if (payload.order) {
    const orderTotals = orderTotalsFromJourneyOrder(payload.order);
    // The only moment shipping and tax are known for this order, so the
    // commissionable base is computed here rather than inferred later.
    commissionBase = commissionBaseFrom({
      orderRevenue: commission.orderRevenue,
      ...orderTotals,
    });
    await prisma.orderAttribution.upsert({
      where: { wooOrderId: payload.order.wooOrderId },
      create: {
        wooOrderId: payload.order.wooOrderId,
        ...orderAttribution,
        ...orderTotals,
      },
      update: {
        ...orderAttribution,
        ...orderTotals,
        syncedAt: new Date(),
      },
    });
  }

  const winningRule =
    audit?.winningRule && isWinningRule(audit.winningRule)
      ? audit.winningRule
      : null;

  await prisma.commission.update({
    where: { id: commission.id },
    data: {
      ...(commissionBase === undefined ? {} : { commissionBase }),
      visitSlicewpId:
        payload.commission.visitId ??
        commission.visitSlicewpId ??
        null,
      customerSlicewpId:
        payload.commission.customerId ??
        commission.customerSlicewpId ??
        null,
      winningRule,
      attributionAudit: audit
        ? (audit as Prisma.InputJsonValue)
        : ({ syncedWithoutAudit: true } as Prisma.InputJsonValue),
    },
  });

  return true;
}

/**
 * Pull journey/audit data from the WP bridge for commissions still missing it.
 * Read-only on WordPress — writes Supabase only.
 */
export async function enrichCommissionJourneyAfterSync(): Promise<JourneyEnrichResult> {
  const bridgeAvailable = await isBridgeAvailable().catch(() => false);

  if (!bridgeAvailable) {
    return { enriched: 0, bridgeAvailable: false, pendingRemaining: 0 };
  }

  const pending = await prisma.commission.findMany({
    where: journeyPendingWhere(),
    orderBy: { dateCreated: "desc" },
    take: JOURNEY_ENRICH_PER_SYNC,
  });

  if (pending.length === 0) {
    return { enriched: 0, bridgeAvailable: true, pendingRemaining: 0 };
  }

  const outcomes = await mapWithConcurrency(
    pending,
    JOURNEY_FETCH_CONCURRENCY,
    async (commission) => {
      try {
        await applyJourneyToCommission(
          commission,
          await fetchCommissionJourney(commission.slicewpId, { lite: true })
        );
        return true;
      } catch (error) {
        if (error instanceof BridgeUnavailableError) {
          throw error;
        }
        console.warn(
          `[sync-journey] commission ${commission.slicewpId}:`,
          error
        );
        return false;
      }
    }
  );

  const enriched = outcomes.filter(Boolean).length;

  const pendingRemaining = await prisma.commission.count({
    where: journeyPendingWhere(),
  });

  return { enriched, bridgeAvailable: true, pendingRemaining };
}
