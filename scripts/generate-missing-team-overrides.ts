import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Creates the team overrides a sponsor never earned because their recruit's
 * sales predate the recruit joining the team.
 *
 * Sync only prices overrides for the commissions it fetches in a run, so a
 * member attached to a team after the fact keeps their whole back catalogue
 * unpriced — the roster shows them at goal with no cut beside it. Drives the
 * same batched processor sync uses, so the rows are identical to the ones a
 * normal run would have produced, and re-running is harmless: existing rows are
 * updated rather than duplicated, and paid ones are left as they are.
 *
 *   npx tsx scripts/generate-missing-team-overrides.ts --affiliate=138
 *   npx tsx scripts/generate-missing-team-overrides.ts --affiliate=138 --apply
 */

const CHUNK = 250;

function flag(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const slicewpIds = (flag("affiliate") ?? "")
    .split(",")
    .map((v) => Number(v.trim()))
    .filter((v) => Number.isInteger(v) && v > 0);

  if (slicewpIds.length === 0) {
    throw new Error("Pass --affiliate=138 (comma-separated for several)");
  }

  const { prisma } = await import("../lib/prisma");
  const { createSyncDealRuleProcessor } = await import("../lib/rules-engine");

  const members = await prisma.affiliate.findMany({
    where: { slicewpId: { in: slicewpIds } },
    select: { id: true, slicewpId: true, displayName: true },
  });
  const memberIds = members.map((m) => m.id);

  const processor = await createSyncDealRuleProcessor();
  const notInTeam = members.filter((m) => !processor.teamMemberIds.includes(m.id));
  for (const m of notInTeam) {
    console.log(
      `  skipping #${m.slicewpId} ${m.displayName ?? "?"} — not in any team with an active rule`
    );
  }

  const targets = members.filter((m) => processor.teamMemberIds.includes(m.id));
  if (targets.length === 0) return;

  const before = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId"],
    where: { type: "OVERRIDE", sourceAffiliateId: { in: memberIds } },
    _count: true,
    _sum: { amount: true },
  });

  console.log(`Mode: ${apply ? "APPLY" : "DRY RUN"}\n`);
  for (const m of targets) {
    const row = before.find((b) => b.sourceAffiliateId === m.id);
    const commissions = await prisma.commission.count({
      where: { affiliateId: m.id },
    });
    console.log(
      `  #${m.slicewpId} ${(m.displayName ?? "?").padEnd(20)} ` +
        `${commissions} commissions, ` +
        `${row ? `${row._count} overrides / $${Number(row._sum.amount ?? 0).toFixed(2)}` : "no overrides"}`
    );
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to generate.");
    return;
  }

  // Revenue accrues as the batch is walked, so commissions must arrive
  // oldest-first for milestone thresholds to unlock in the right order.
  const commissions = await prisma.commission.findMany({
    where: { affiliateId: { in: targets.map((m) => m.id) } },
    orderBy: { dateCreated: "asc" },
  });

  const affiliateNames = new Map(
    targets.map((m) => [m.id, m.displayName ?? "recruit"])
  );
  // Starts empty on purpose: replaying from the first sale lets revenue accrue
  // the way it would have during a normal sync, so milestones unlock at the sale
  // that actually crossed the threshold.
  const revenueByRecruit = new Map<string, number>();

  console.log(`\nprocessing ${commissions.length} commissions oldest-first`);
  for (let start = 0; start < commissions.length; start += CHUNK) {
    await processor.processBatch(
      commissions.slice(start, start + CHUNK),
      revenueByRecruit,
      affiliateNames
    );
    process.stdout.write(
      `\r  ${Math.min(start + CHUNK, commissions.length)}/${commissions.length}`
    );
  }
  process.stdout.write("\n");

  await processor.flushMilestonePromotions(revenueByRecruit);

  const after = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId", "status"],
    where: { type: "OVERRIDE", sourceAffiliateId: { in: memberIds } },
    _count: true,
    _sum: { amount: true },
  });

  console.log("\nafter:");
  for (const m of targets) {
    const rows = after.filter((a) => a.sourceAffiliateId === m.id);
    const total = rows.reduce((s, r) => s + Number(r._sum.amount ?? 0), 0);
    console.log(
      `  #${m.slicewpId} ${(m.displayName ?? "?").padEnd(20)} ` +
        `$${total.toFixed(2)} across ${rows.reduce((s, r) => s + r._count, 0)} rows ` +
        `(${rows.map((r) => `${r.status} ${r._count}`).join(", ")})`
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
