import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { getSettings, hasResolvedWooCommerce } from "../settings";
import { journeyPendingWhere } from "../sync-journey";
import { syncCommissionBases, syncLedgerCommissionBases } from "../sync-write";
import { fetchWooOrderTotalsByIds } from "../woocommerce";

/**
 * Fills in the shipping and tax a commissionable base is derived from.
 *
 * Commissions are calculated on the order total less shipping and tax, but the
 * portal only stored SliceWP's `reference_amount`, which is the gross total.
 * Until each order's own figures are on file every "sales generated" number
 * reads high, and any team cut priced as a share of sales reads high with it.
 *
 * Reads the store 100 orders at a time rather than one per commission, which is
 * the difference between a minute and most of a day across the full ledger.
 */

const ORDERS_PER_REQUEST = 100;
const WRITE_CHUNK = 500;

export type OrderTotalsBackfillOptions = {
  apply?: boolean;
  limit?: number | null;
  affiliateSlicewpId?: number | null;
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
};

export type OrderTotalsBackfillResult = {
  applied: boolean;
  pendingSales: number;
  orders: number;
  requests: number;
  fetched: number;
  missing: number;
  withShipping: number;
  withTax: number;
  grossTotal: number;
  netTotal: number;
  netShareOfGross: number | null;
  ordersWritten: number;
  basesComputed: number;
  ledgerLinesMirrored: number;
  salesStillWithoutBase: number;
};

/**
 * `.env.local` points WooCommerce at Local WP for dev, and when the production
 * Settings row can't be decrypted the resolver quietly falls back to it. A run
 * aimed at the production database would then source figures from a local copy
 * and store them as though they were real, so refuse the mismatch outright.
 */
function assertStoreMatchesDatabase(storeUrl: string) {
  const writingProd = !process.env.DATABASE_URL?.includes("localhost");
  const localStore = /\.local(\/|$)|localhost|127\.0\.0\.1/.test(storeUrl);

  if (writingProd && localStore) {
    throw new Error(
      `Refusing to run: target database is production but the store resolved ` +
        `to ${storeUrl}. Order totals would come from a local copy.`
    );
  }
}

export async function backfillOrderTotals(
  options: OrderTotalsBackfillOptions = {}
): Promise<OrderTotalsBackfillResult> {
  const { apply = false, limit = null, affiliateSlicewpId = null } = options;

  const pending = await prisma.commission.findMany({
    where: {
      ...journeyPendingWhere({ mode: "missing-order-totals" }),
      ...(affiliateSlicewpId
        ? { affiliate: { slicewpId: affiliateSlicewpId } }
        : {}),
    },
    select: { wooOrderId: true },
    // Newest first so a limited run improves the figures people are looking at.
    orderBy: { dateCreated: "desc" },
    ...(limit ? { take: limit } : {}),
  });

  const orderIds = Array.from(
    new Set(pending.map((c) => c.wooOrderId).filter((id): id is number => !!id))
  );
  const requests = Math.ceil(orderIds.length / ORDERS_PER_REQUEST);

  const empty: OrderTotalsBackfillResult = {
    applied: apply,
    pendingSales: pending.length,
    orders: orderIds.length,
    requests,
    fetched: 0,
    missing: 0,
    withShipping: 0,
    withTax: 0,
    grossTotal: 0,
    netTotal: 0,
    netShareOfGross: null,
    ordersWritten: 0,
    basesComputed: 0,
    ledgerLinesMirrored: 0,
    salesStillWithoutBase: 0,
  };

  if (orderIds.length === 0) return empty;

  const settings = await getSettings();
  if (!hasResolvedWooCommerce(settings)) {
    throw new Error("No WooCommerce credentials available");
  }
  assertStoreMatchesDatabase(settings.wcStoreUrl);

  const totals = await fetchWooOrderTotalsByIds(
    settings.wcStoreUrl,
    settings.wcConsumerKey,
    settings.wcConsumerSecret,
    orderIds,
    {
      concurrency: options.concurrency ?? 2,
      onBatch: (done) => options.onProgress?.(done, requests),
    }
  );

  const rows = Array.from(totals.values());
  const grossTotal = rows.reduce((sum, r) => sum + r.total, 0);
  const netTotal = rows.reduce(
    (sum, r) => sum + Math.max(r.total - r.shipping - r.tax, 0),
    0
  );

  const result: OrderTotalsBackfillResult = {
    ...empty,
    fetched: rows.length,
    missing: orderIds.length - rows.length,
    withShipping: rows.filter((r) => r.shipping > 0).length,
    withTax: rows.filter((r) => r.tax > 0).length,
    grossTotal: Math.round(grossTotal * 100) / 100,
    netTotal: Math.round(netTotal * 100) / 100,
    netShareOfGross: grossTotal > 0 ? netTotal / grossTotal : null,
  };

  if (!apply || rows.length === 0) return result;

  let ordersWritten = 0;
  for (let start = 0; start < rows.length; start += WRITE_CHUNK) {
    const chunk = rows.slice(start, start + WRITE_CHUNK);
    const values = Prisma.join(
      chunk.map(
        (r) => Prisma.sql`(${r.id}::int, ${r.total.toFixed(2)}::numeric,
          ${r.shipping.toFixed(2)}::numeric, ${r.tax.toFixed(2)}::numeric)`
      )
    );
    ordersWritten += await prisma.$executeRaw`
      INSERT INTO "OrderAttribution" ("id", "wooOrderId", "orderTotal", "orderShipping", "orderTax", "couponCodes", "syncedAt", "updatedAt")
      SELECT gen_random_uuid()::text, v.order_id, v.total, v.shipping, v.tax, ARRAY[]::text[], NOW(), NOW()
      FROM (VALUES ${values}) AS v(order_id, total, shipping, tax)
      ON CONFLICT ("wooOrderId") DO UPDATE
      SET "orderTotal" = EXCLUDED."orderTotal",
          "orderShipping" = EXCLUDED."orderShipping",
          "orderTax" = EXCLUDED."orderTax",
          "updatedAt" = NOW()
    `;
  }

  const basesComputed = await syncCommissionBases();
  const ledgerLinesMirrored = await syncLedgerCommissionBases();
  const salesStillWithoutBase = await prisma.commission.count({
    where: journeyPendingWhere({ mode: "missing-order-totals" }),
  });

  return {
    ...result,
    ordersWritten,
    basesComputed,
    ledgerLinesMirrored,
    salesStillWithoutBase,
  };
}
