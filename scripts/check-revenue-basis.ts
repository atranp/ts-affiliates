import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: is `Commission.orderRevenue` the number the commission rate was
 * actually applied to, or a gross Woo order total (shipping + tax included)?
 */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) => `$${v.toFixed(2)}`;

  // 1. Implied rate distribution: amount / orderRevenue per row.
  const rows = await prisma.commission.findMany({
    where: { ...countableRevenueWhere, orderRevenue: { gt: 0 } },
    select: { amount: true, orderRevenue: true, wooOrderId: true, type: true },
  });

  const buckets = new Map<string, number>();
  for (const row of rows) {
    const rate = (n(row.amount) / n(row.orderRevenue)) * 100;
    const key = rate.toFixed(1);
    buckets.set(key, (buckets.get(key) ?? 0) + 1);
  }

  console.log(`=== implied rate = amount / orderRevenue (${rows.length} rows) ===`);
  const sorted = Array.from(buckets.entries()).sort((a, b) => b[1] - a[1]);
  for (const [rate, count] of sorted.slice(0, 15)) {
    console.log(`  ${rate.padStart(6)}%  ${count.toLocaleString("en-US")}`);
  }
  if (sorted.length > 15) console.log(`  ...${sorted.length - 15} more buckets`);

  // 2. Where we have Woo order totals cached, does orderRevenue equal the
  //    subtotal, or the gross total?
  const orderIds = Array.from(
    new Set(rows.map((r) => r.wooOrderId).filter((id): id is number => !!id))
  );

  const attributions = await prisma.orderAttribution.findMany({
    where: { wooOrderId: { in: orderIds }, orderTotal: { not: null } },
    select: {
      wooOrderId: true,
      orderSubtotal: true,
      orderShipping: true,
      orderTax: true,
      orderTotal: true,
    },
  });

  const byOrder = new Map(attributions.map((a) => [a.wooOrderId, a]));

  let compared = 0;
  let matchesSubtotal = 0;
  let matchesTotal = 0;
  let matchesNeither = 0;
  let sumRevenue = 0;
  let sumSubtotal = 0;
  let sumTotal = 0;
  const samples: string[] = [];

  for (const row of rows) {
    if (!row.wooOrderId) continue;
    const attr = byOrder.get(row.wooOrderId);
    if (!attr) continue;

    const revenue = n(row.orderRevenue);
    const subtotal = n(attr.orderSubtotal);
    const total = n(attr.orderTotal);

    compared += 1;
    sumRevenue += revenue;
    sumSubtotal += subtotal;
    sumTotal += total;

    const nearSubtotal = Math.abs(revenue - subtotal) < 0.02;
    const nearTotal = Math.abs(revenue - total) < 0.02;

    if (nearSubtotal) matchesSubtotal += 1;
    else if (nearTotal) matchesTotal += 1;
    else {
      matchesNeither += 1;
      if (samples.length < 8) {
        samples.push(
          `  order #${row.wooOrderId}: orderRevenue ${m(revenue)} | subtotal ${m(subtotal)} ` +
            `| ship ${m(n(attr.orderShipping))} | tax ${m(n(attr.orderTax))} | total ${m(total)}`
        );
      }
    }
  }

  console.log(`\n=== orderRevenue vs cached Woo totals (${compared} orders with totals) ===`);
  if (compared === 0) {
    console.log("  no cached Woo order totals to compare against");
  } else {
    console.log(`  == subtotal:  ${matchesSubtotal} (${((matchesSubtotal / compared) * 100).toFixed(1)}%)`);
    console.log(`  == total:     ${matchesTotal} (${((matchesTotal / compared) * 100).toFixed(1)}%)`);
    console.log(`  neither:      ${matchesNeither} (${((matchesNeither / compared) * 100).toFixed(1)}%)`);
    console.log(`\n  Σ orderRevenue: ${m(sumRevenue)}`);
    console.log(`  Σ subtotal:     ${m(sumSubtotal)}`);
    console.log(`  Σ order total:  ${m(sumTotal)}`);
    if (samples.length) {
      console.log("\n  mismatched samples:");
      console.log(samples.join("\n"));
    }
  }
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
