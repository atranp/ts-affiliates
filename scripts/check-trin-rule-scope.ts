import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: why does only one member of Trin's roster earn her a team cut?
 */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getTeamMemberIds } = await import("../lib/teams/members");

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const rules = await prisma.dealRule.findMany({
    where: { sponsorAffiliateId: trin.id },
    select: {
      id: true,
      name: true,
      active: true,
      basis: true,
      ratePercent: true,
      metadata: true,
      teamId: true,
      sourceAffiliateId: true,
      sourceAffiliate: { select: { displayName: true, slicewpId: true } },
      milestoneRevenueThreshold: true,
    },
  });

  console.log("=== Trin's deal rules ===");
  for (const rule of rules) {
    console.log({
      name: rule.name,
      active: rule.active,
      basis: rule.basis,
      rate: rule.ratePercent.toString(),
      metadata: rule.metadata,
      teamId: rule.teamId,
      scopedToOneRecruit: rule.sourceAffiliate
        ? `${rule.sourceAffiliate.displayName} (#${rule.sourceAffiliate.slicewpId})`
        : "no — whole team",
      milestone: rule.milestoneRevenueThreshold?.toString() ?? null,
    });
  }

  const teamRule = rules.find((r) => r.active && r.teamId);
  if (!teamRule?.teamId) return;

  const memberIds = await getTeamMemberIds(teamRule.teamId);

  const members = await prisma.affiliate.findMany({
    where: { id: { in: memberIds } },
    select: { id: true, slicewpId: true, displayName: true, status: true },
  });

  const overrideCounts = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId"],
    where: { affiliateId: trin.id, type: "OVERRIDE" },
    _count: true,
    _sum: { amount: true },
  });
  const overrideBySource = new Map(
    overrideCounts.map((row) => [row.sourceAffiliateId, row])
  );

  console.log(`\n=== ${memberIds.length} team members: who generates overrides? ===`);
  const sales = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: { affiliateId: { in: memberIds }, status: { in: ["UNPAID", "PAID"] } },
    _sum: { orderRevenue: true, amount: true },
  });
  const salesBy = new Map(sales.map((s) => [s.affiliateId, s]));

  for (const member of members.sort((a, b) => {
    const av = Number(salesBy.get(a.id)?._sum.orderRevenue ?? 0);
    const bv = Number(salesBy.get(b.id)?._sum.orderRevenue ?? 0);
    return bv - av;
  })) {
    const s = salesBy.get(member.id);
    const o = overrideBySource.get(member.id);
    const gross = Number(s?._sum.orderRevenue ?? 0);
    const comm = Number(s?._sum.amount ?? 0);
    if (gross === 0 && !o) continue;
    console.log(
      `  #${String(member.slicewpId).padStart(4)} ${(member.displayName ?? "?").slice(0, 22).padEnd(22)} ` +
        `sales $${gross.toFixed(2).padStart(12)}  commission $${comm.toFixed(2).padStart(11)} ` +
        `(${gross > 0 ? ((comm / gross) * 100).toFixed(1) : "—"}% of gross)  ` +
        `overrides ${o ? `${o._count} / $${Number(o._sum.amount ?? 0).toFixed(2)}` : "NONE"}`
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
