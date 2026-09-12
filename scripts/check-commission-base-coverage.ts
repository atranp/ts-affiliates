import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: how much of the book could show a net commission base today, and
 * what would the headline revenue figures become if we switched?
 */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) => `$${v.toFixed(2)}`;

  const rows = await prisma.commission.findMany({
    where: { ...countableRevenueWhere, orderRevenue: { gt: 0 } },
    select: {
      amount: true,
      orderRevenue: true,
      wooOrderId: true,
      affiliate: { select: { slicewpId: true, displayName: true } },
    },
  });

  const orderIds = Array.from(
    new Set(rows.map((r) => r.wooOrderId).filter((id): id is number => !!id))
  );

  const attributions = await prisma.orderAttribution.findMany({
    where: { wooOrderId: { in: orderIds }, orderTotal: { not: null } },
    select: {
      wooOrderId: true,
      orderShipping: true,
      orderTax: true,
      orderTotal: true,
    },
  });
  const byOrder = new Map(attributions.map((a) => [a.wooOrderId, a]));

  type Bucket = {
    name: string;
    rows: number;
    covered: number;
    grossAll: number;
    grossCovered: number;
    netCovered: number;
    commission: number;
  };

  const buckets = new Map<number, Bucket>();
  const all: Bucket = {
    name: "PLATFORM",
    rows: 0,
    covered: 0,
    grossAll: 0,
    grossCovered: 0,
    netCovered: 0,
    commission: 0,
  };

  for (const row of rows) {
    const slicewpId = row.affiliate.slicewpId;
    const bucket =
      buckets.get(slicewpId) ??
      ({
        name: `#${slicewpId} ${row.affiliate.displayName ?? ""}`.trim(),
        rows: 0,
        covered: 0,
        grossAll: 0,
        grossCovered: 0,
        netCovered: 0,
        commission: 0,
      } as Bucket);
    buckets.set(slicewpId, bucket);

    const gross = n(row.orderRevenue);
    for (const target of [bucket, all]) {
      target.rows += 1;
      target.grossAll += gross;
      target.commission += n(row.amount);
    }

    const attr = row.wooOrderId ? byOrder.get(row.wooOrderId) : undefined;
    if (!attr) continue;

    const net = gross - n(attr.orderShipping) - n(attr.orderTax);
    for (const target of [bucket, all]) {
      target.covered += 1;
      target.grossCovered += gross;
      target.netCovered += net;
    }
  }

  function report(bucket: Bucket) {
    const coverage = bucket.rows ? (bucket.covered / bucket.rows) * 100 : 0;
    const ratio =
      bucket.grossCovered > 0 ? bucket.netCovered / bucket.grossCovered : null;

    console.log(`\n=== ${bucket.name} ===`);
    console.log(
      `  rows ${bucket.rows.toLocaleString("en-US")} · Woo totals cached for ${bucket.covered.toLocaleString("en-US")} (${coverage.toFixed(1)}%)`
    );
    console.log(`  gross (what dashboard shows today): ${m(bucket.grossAll)}`);
    if (ratio !== null) {
      console.log(
        `  net/gross on covered rows:           ${(ratio * 100).toFixed(2)}%`
      );
      console.log(
        `  projected net revenue if switched:   ${m(bucket.grossAll * ratio)}  (${m(bucket.grossAll * ratio - bucket.grossAll)})`
      );
      console.log(
        `  implied rate — gross ${((bucket.commission / bucket.grossAll) * 100).toFixed(2)}% → net ${((bucket.commission / (bucket.grossAll * ratio)) * 100).toFixed(2)}%`
      );
    } else {
      console.log("  no cached Woo totals — cannot project");
    }
  }

  report(all);
  for (const slicewpId of [51, 81, 138]) {
    const bucket = buckets.get(slicewpId);
    if (bucket) report(bucket);
  }

  const missing = rows.filter(
    (r) => !r.wooOrderId || !byOrder.has(r.wooOrderId)
  ).length;
  console.log(
    `\nOrders needing a Woo totals backfill before this can be exact: ${missing.toLocaleString("en-US")} commission rows`
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
