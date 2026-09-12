import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/** Read-only: what the roster's "their sales" column now reports, vs gross. */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { countableRevenueByAffiliate, countableRevenueWhere } = await import(
    "../lib/revenue"
  );

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  if (!trin) throw new Error("Trin not found");

  const rule = await prisma.dealRule.findFirst({
    where: { sponsorAffiliateId: trin.id, active: true, teamId: { not: null } },
    select: { teamId: true },
  });
  if (!rule?.teamId) throw new Error("No team rule");

  const { getTeamMemberIds } = await import("../lib/teams/members");
  const memberIds = await getTeamMemberIds(rule.teamId);

  const net = await countableRevenueByAffiliate(memberIds);

  const gross = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: { ...countableRevenueWhere, affiliateId: { in: memberIds } },
    _sum: { orderRevenue: true },
  });
  const grossBy = new Map(
    gross.map((g) => [g.affiliateId, Number(g._sum.orderRevenue ?? 0)])
  );

  const members = await prisma.affiliate.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, slicewpId: true, displayName: true },
  });

  let grossTotal = 0;
  let netTotal = 0;

  console.log('roster "their sales" — was gross, now commissionable:\n');
  for (const m of members.sort(
    (a, b) => (grossBy.get(b.id) ?? 0) - (grossBy.get(a.id) ?? 0)
  )) {
    const g = grossBy.get(m.id) ?? 0;
    const n = net.get(m.id) ?? 0;
    if (g === 0) continue;
    grossTotal += g;
    netTotal += n;
    console.log(
      `  #${String(m.slicewpId).padStart(4)} ${(m.displayName ?? "?").slice(0, 20).padEnd(20)} ` +
        `gross $${g.toFixed(2).padStart(11)} → now $${n.toFixed(2).padStart(11)}  ` +
        `(${g > 0 ? ((n / g) * 100).toFixed(1) : "—"}%)`
    );
  }

  console.log(
    `\n  ${"TEAM SALES".padEnd(26)} gross $${grossTotal.toFixed(2)} → now $${netTotal.toFixed(2)} ` +
      `(${((netTotal / grossTotal) * 100).toFixed(1)}%)`
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
