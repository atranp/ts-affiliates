import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: what are Trin's team overrides actually sourced from, and does the
 * commissionable base cover the sales that count as revenue?
 */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const countable = countableRevenueWhere;

  const total = await prisma.commission.count({ where: countable });
  const withBase = await prisma.commission.count({
    where: { ...countable, commissionBase: { not: null } },
  });
  console.log(
    `commissionable base covers ${withBase}/${total} countable sales ` +
      `(${((withBase / total) * 100).toFixed(1)}%)\n`
  );

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  if (!trin) throw new Error("Trin not found");

  const rows = await prisma.ledgerEntry.findMany({
    where: { affiliateId: trin.id, type: "OVERRIDE" },
    select: {
      status: true,
      amount: true,
      sourceCommission: {
        select: {
          type: true,
          amount: true,
          orderRevenue: true,
          commissionBase: true,
        },
      },
    },
  });

  const byType = new Map<
    string,
    { count: number; commission: number; gross: number; net: number; cut: number }
  >();

  for (const row of rows) {
    const type = row.sourceCommission?.type ?? "(no source)";
    const bucket =
      byType.get(type) ??
      { count: 0, commission: 0, gross: 0, net: 0, cut: 0 };
    bucket.count += 1;
    bucket.commission += Number(row.sourceCommission?.amount ?? 0);
    bucket.gross += Number(row.sourceCommission?.orderRevenue ?? 0);
    bucket.net += Number(
      row.sourceCommission?.commissionBase ?? row.sourceCommission?.orderRevenue ?? 0
    );
    bucket.cut += Number(row.amount);
    byType.set(type, bucket);
  }

  console.log("Trin's override rows by source commission type:");
  for (const [type, b] of Array.from(byType.entries())) {
    console.log(
      `  ${type.padEnd(12)} ${String(b.count).padStart(5)} rows  ` +
        `their commission $${b.commission.toFixed(2).padStart(11)}  ` +
        `gross $${b.gross.toFixed(2).padStart(11)}  net $${b.net.toFixed(2).padStart(11)}  ` +
        `rate on net ${b.net > 0 ? ((b.commission / b.net) * 100).toFixed(1) : "—"}%`
    );
  }

  const missingBase = rows.filter(
    (r) => r.sourceCommission && r.sourceCommission.commissionBase === null
  ).length;
  console.log(`\noverride rows whose source still lacks a net base: ${missingBase}`);
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
