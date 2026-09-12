import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/** Read-only: where does the home dashboard "Sales generated" figure come from? */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getAffiliatePerformance } = await import("../lib/affiliate/performance");
  const { resolvePeriod } = await import("../lib/affiliate/period");
  const { toNumber } = await import("../lib/format");
  const { getTeamsForSponsor } = await import("../lib/teams/queries");

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const m = (v: number) => `$${v.toFixed(2)}`;

  const { range, previous, label } = resolvePeriod({ key: "all" });
  const perf = await getAffiliatePerformance(trin.id, range, previous);

  console.log(`=== ${trin.displayName} · Sales generated (${label}) ===\n`);
  console.log(`  Dashboard shows:  ${m(perf.current.revenue)}`);
  console.log(`  Earnings (all):   ${m(perf.current.earnings)}`);
  console.log(`  Sales count:      ${perf.current.sales.toLocaleString()}`);

  const withBase = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: "DIRECT",
      commissionBase: { not: null },
    },
    _sum: { commissionBase: true, orderRevenue: true, amount: true },
    _count: true,
  });
  const grossOnly = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: "DIRECT",
      commissionBase: null,
      orderRevenue: { not: null },
    },
    _sum: { orderRevenue: true },
    _count: true,
  });

  console.log("\n  Formula: SUM(commissionBase ?? orderRevenue) on DIRECT ledger rows only");
  console.log(
    `    ${withBase._count} rows with net base:  ${m(toNumber(withBase._sum.commissionBase))}`
  );
  console.log(
    `    ${grossOnly._count} rows still gross:   ${m(toNumber(grossOnly._sum.orderRevenue))}`
  );
  console.log(
    `    combined:                         ${m(
      toNumber(withBase._sum.commissionBase) + toNumber(grossOnly._sum.orderRevenue)
    )}`
  );

  const overrideRev = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trin.id, type: "OVERRIDE" },
    _sum: { commissionBase: true, orderRevenue: true, amount: true },
    _count: true,
  });
  console.log(
    `\n  NOT included — team OVERRIDE sales value: ${m(
      toNumber(overrideRev._sum.commissionBase ?? overrideRev._sum.orderRevenue)
    )} across ${overrideRev._count} rows`
  );

  const teams = await getTeamsForSponsor(trin.id);
  for (const team of teams) {
    console.log(
      `\n  NOT included — team roster "Team sales": ${m(team.stats.totalRevenue)} (${team.name})`
    );
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
