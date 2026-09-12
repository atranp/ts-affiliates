import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/** Read-only progress check for the commission ÷ 3 recalc. */

const RULE_ID = "cms2tqkqd0005jk04bw0mgd5h";

async function main() {
  const { prisma } = await import("../lib/prisma");

  const rule = await prisma.dealRule.findUnique({
    where: { id: RULE_ID },
    select: { name: true, basis: true, ratePercent: true, metadata: true, teamId: true },
  });
  console.log("rule now:", rule);

  const byStatus = await prisma.ledgerEntry.groupBy({
    by: ["status"],
    where: { dealRuleId: RULE_ID, type: "OVERRIDE" },
    _sum: { amount: true },
    _count: true,
  });

  console.log("\noverride rows by status:");
  for (const row of byStatus) {
    console.log(
      `  ${row.status.padEnd(8)} ${String(row._count).padStart(5)} rows  $${Number(row._sum.amount ?? 0).toFixed(2)}`
    );
  }

  // How far has the walk got? Rows the recalc has touched carry a fresh
  // updatedAt; the loop runs oldest commission first.
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const touched = await prisma.ledgerEntry.count({
    where: { dealRuleId: RULE_ID, type: "OVERRIDE", updatedAt: { gte: since } },
  });
  const total = await prisma.ledgerEntry.count({
    where: { dealRuleId: RULE_ID, type: "OVERRIDE" },
  });
  console.log(`\ntouched in last hour: ${touched} / ${total} override rows`);

  const newest = await prisma.ledgerEntry.findFirst({
    where: { dealRuleId: RULE_ID, type: "OVERRIDE" },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true, occurredAt: true, status: true, amount: true },
  });
  console.log("most recently written row:", newest);

  if (rule?.teamId) {
    const { getTeamMemberIds } = await import("../lib/teams/members");
    const memberIds = await getTeamMemberIds(rule.teamId);
    const loopSize = await prisma.commission.count({
      where: { affiliateId: { in: memberIds } },
    });
    console.log(
      `\nteam members: ${memberIds.length} · commissions the retro pass walks: ${loopSize.toLocaleString("en-US")}`
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
