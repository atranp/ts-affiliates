import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only proof that the commission base is order total − shipping − tax:
 * on orders where Woo totals are cached, does commission / net-base land on the
 * affiliate's own configured SliceWP rate?
 */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);

  const rows = await prisma.commission.findMany({
    where: {
      ...countableRevenueWhere,
      orderRevenue: { gt: 0 },
      wooOrderId: { not: null },
    },
    select: {
      amount: true,
      orderRevenue: true,
      wooOrderId: true,
      type: true,
      affiliate: {
        select: { slicewpId: true, displayName: true, commissionRate: true },
      },
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

  type Stat = {
    label: string;
    configured: number | null;
    onRate: number;
    offRate: number;
    lifetime: number;
    sumCommission: number;
    sumNet: number;
    sumGross: number;
  };

  const stats = new Map<number, Stat>();

  for (const row of rows) {
    const attr = row.wooOrderId ? byOrder.get(row.wooOrderId) : undefined;
    if (!attr) continue;

    const slicewpId = row.affiliate.slicewpId;
    const stat =
      stats.get(slicewpId) ??
      ({
        label: `#${slicewpId} ${row.affiliate.displayName ?? ""}`.trim(),
        configured:
          row.affiliate.commissionRate === null
            ? null
            : n(row.affiliate.commissionRate),
        onRate: 0,
        offRate: 0,
        lifetime: 0,
        sumCommission: 0,
        sumNet: 0,
        sumGross: 0,
      } as Stat);
    stats.set(slicewpId, stat);

    const gross = n(row.orderRevenue);
    const net = gross - n(attr.orderShipping) - n(attr.orderTax);
    const amount = n(row.amount);

    stat.sumCommission += amount;
    stat.sumNet += net;
    stat.sumGross += gross;

    if (net <= 0) continue;
    const rate = (amount / net) * 100;

    if ((row.type ?? "").toLowerCase().includes("lifetime")) {
      stat.lifetime += 1;
    } else if (
      stat.configured !== null &&
      Math.abs(rate - stat.configured) < 0.2
    ) {
      stat.onRate += 1;
    } else {
      stat.offRate += 1;
    }
  }

  const ranked = Array.from(stats.values())
    .filter((s) => s.onRate + s.offRate + s.lifetime >= 20)
    .sort((a, b) => b.sumCommission - a.sumCommission)
    .slice(0, 15);

  console.log(
    "=== commission / (total − shipping − tax) vs the affiliate's configured rate ===\n"
  );
  console.log(
    "  affiliate                       cfg   on-rate  off  lifetime   blended-net  blended-gross"
  );

  for (const s of ranked) {
    const blendedNet = s.sumNet > 0 ? (s.sumCommission / s.sumNet) * 100 : 0;
    const blendedGross =
      s.sumGross > 0 ? (s.sumCommission / s.sumGross) * 100 : 0;
    console.log(
      `  ${s.label.slice(0, 30).padEnd(30)} ` +
        `${(s.configured === null ? "—" : `${s.configured}%`).padStart(5)} ` +
        `${String(s.onRate).padStart(8)} ${String(s.offRate).padStart(4)} ` +
        `${String(s.lifetime).padStart(9)} ` +
        `${`${blendedNet.toFixed(2)}%`.padStart(13)} ${`${blendedGross.toFixed(2)}%`.padStart(14)}`
    );
  }

  const totals = ranked.reduce(
    (acc, s) => {
      acc.on += s.onRate;
      acc.off += s.offRate;
      acc.lifetime += s.lifetime;
      return acc;
    },
    { on: 0, off: 0, lifetime: 0 }
  );
  const classified = totals.on + totals.off;
  console.log(
    `\n  on configured rate: ${totals.on}/${classified} (${((totals.on / classified) * 100).toFixed(1)}%)  · lifetime rows excluded: ${totals.lifetime}`
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
