import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: which order figure produces clean commission rates?
 *
 * Tries orderRevenue (SliceWP reference_amount ≈ gross total), subtotal,
 * total − shipping, and total − shipping − tax, and reports how many rows land
 * on a "clean" rate for each candidate base.
 */

const CLEAN_RATES = [10, 15, 20, 25, 30, 35, 40, 45, 50];

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) => `$${v.toFixed(2)}`;

  const rows = await prisma.commission.findMany({
    where: { ...countableRevenueWhere, orderRevenue: { gt: 0 }, wooOrderId: { not: null } },
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
      orderSubtotal: true,
      orderShipping: true,
      orderTax: true,
      orderTotal: true,
    },
  });
  const byOrder = new Map(attributions.map((a) => [a.wooOrderId, a]));

  const candidates = {
    "reference_amount (current)": (r: number) => r,
    subtotal: (_r: number, s: number) => s,
    "total − shipping": (r: number, _s: number, ship: number) => r - ship,
    "total − shipping − tax": (
      r: number,
      _s: number,
      ship: number,
      tax: number
    ) => r - ship - tax,
  };

  const score = new Map<string, { clean: number; sum: number }>();
  for (const key of Object.keys(candidates)) {
    score.set(key, { clean: 0, sum: 0 });
  }

  let compared = 0;

  for (const row of rows) {
    const attr = byOrder.get(row.wooOrderId!);
    if (!attr) continue;

    const amount = n(row.amount);
    const revenue = n(row.orderRevenue);
    const subtotal = n(attr.orderSubtotal);
    const shipping = n(attr.orderShipping);
    const tax = n(attr.orderTax);

    compared += 1;

    for (const [label, fn] of Object.entries(candidates)) {
      const base = fn(revenue, subtotal, shipping, tax);
      const bucket = score.get(label)!;
      bucket.sum += base;
      if (base <= 0) continue;
      const rate = (amount / base) * 100;
      if (CLEAN_RATES.some((clean) => Math.abs(rate - clean) < 0.15)) {
        bucket.clean += 1;
      }
    }
  }

  console.log(`=== which base yields a clean rate? (${compared} orders) ===`);
  for (const [label, bucket] of Array.from(score.entries())) {
    const pct = compared ? ((bucket.clean / compared) * 100).toFixed(1) : "0.0";
    console.log(
      `  ${label.padEnd(28)} clean ${String(bucket.clean).padStart(5)} (${pct.padStart(5)}%)   Σ ${m(bucket.sum)}`
    );
  }

  // Per-affiliate: does a single rate explain the whole book once we pick the
  // winning base? Reported for the pilot cohort.
  const pilots = [51, 81, 138];
  for (const slicewpId of pilots) {
    const mine = rows.filter((r) => r.affiliate.slicewpId === slicewpId);
    if (mine.length === 0) continue;

    let sumAmount = 0;
    let sumReference = 0;
    let sumSubtotal = 0;
    let sumExShip = 0;
    let withTotals = 0;

    for (const row of mine) {
      sumAmount += n(row.amount);
      sumReference += n(row.orderRevenue);
      const attr = byOrder.get(row.wooOrderId!);
      if (!attr) continue;
      withTotals += 1;
      sumSubtotal += n(attr.orderSubtotal);
      sumExShip += n(row.orderRevenue) - n(attr.orderShipping);
    }

    console.log(
      `\n=== affiliate #${slicewpId} ${mine[0].affiliate.displayName ?? ""} (${mine.length} rows, ${withTotals} with totals) ===`
    );
    console.log(`  Σ commission:       ${m(sumAmount)}`);
    console.log(
      `  Σ reference_amount: ${m(sumReference)}  → blended ${((sumAmount / sumReference) * 100).toFixed(2)}%`
    );
    if (withTotals > 0) {
      console.log(
        `  Σ subtotal:         ${m(sumSubtotal)}  → blended ${((sumAmount / sumSubtotal) * 100).toFixed(2)}%  (subset)`
      );
      console.log(
        `  Σ total − shipping: ${m(sumExShip)}  → blended ${((sumAmount / sumExShip) * 100).toFixed(2)}%  (subset)`
      );
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
