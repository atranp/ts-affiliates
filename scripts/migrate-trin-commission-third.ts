import { config } from "dotenv";
import { DealBasis } from "@prisma/client";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Switch Trin's team cut from 10% × order revenue to commission ÷ 3 (Gavin ops).
 *
 * Dry-run by default:
 *   npx tsx scripts/migrate-trin-commission-third.ts
 * Apply (local or via with-prod-supabase):
 *   npx tsx scripts/migrate-trin-commission-third.ts --apply
 */

async function main() {
  const apply = process.argv.includes("--apply");
  if (process.env.BACKFILL_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  } else if (!process.env.DATABASE_URL?.includes("localhost")) {
    process.env.DATABASE_URL = prodDatabaseUrl();
  }

  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { calculateOverrideAmount } = await import("../lib/deal-rules");
  const { toNumber } = await import("../lib/format");

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin (#51) not found");

  const rule = await prisma.dealRule.findFirst({
    where: { active: true, sponsorAffiliateId: trin.id, teamId: { not: null } },
  });
  if (!rule) throw new Error("No active team deal rule for Trin");

  console.log("Current rule:", {
    id: rule.id,
    name: rule.name,
    basis: rule.basis,
    ratePercent: rule.ratePercent.toString(),
    metadata: rule.metadata,
  });

  const unpaidOverrides = await prisma.ledgerEntry.findMany({
    where: {
      dealRuleId: rule.id,
      type: "OVERRIDE",
      status: { in: ["UNPAID", "PENDING"] },
    },
    select: {
      id: true,
      amount: true,
      status: true,
      sourceCommission: {
        select: { amount: true, orderRevenue: true },
      },
    },
  });

  let oldTotal = 0;
  let newTotal = 0;
  let changedRows = 0;

  const nextRule = {
    ...rule,
    basis: DealBasis.RECRUIT_COMMISSION,
    ratePercent: rule.ratePercent,
    metadata: { commissionDivisor: 3 },
  };

  for (const row of unpaidOverrides) {
    if (!row.sourceCommission) continue;
    const oldAmount = toNumber(row.amount);
    const newAmount = calculateOverrideAmount(nextRule, row.sourceCommission);
    oldTotal += oldAmount;
    newTotal += newAmount;
    if (Math.abs(oldAmount - newAmount) >= 0.005) changedRows += 1;
  }

  console.log("\nUnpaid/pending override preview (commission ÷ 3):");
  console.log(`  rows:    ${unpaidOverrides.length}`);
  console.log(`  changed: ${changedRows}`);
  console.log(`  old Σ:   $${oldTotal.toFixed(2)}`);
  console.log(`  new Σ:   $${newTotal.toFixed(2)}`);
  console.log(`  delta:   $${(newTotal - oldTotal).toFixed(2)}`);

  if (!apply) {
    console.log("\nDry run — pass --apply to update rule + recalc unpaid overrides.");
    return;
  }

  await prisma.dealRule.update({
    where: { id: rule.id },
    data: {
      basis: DealBasis.RECRUIT_COMMISSION,
      metadata: { commissionDivisor: 3 },
    },
  });

  // Only unpaid/pending rows are repriced — paid history is a record of money
  // that already moved. Written as one statement per chunk rather than a row at
  // a time: the generic retroactive pass re-checks milestones per commission,
  // which is hours of round trips against a remote database for work that is a
  // pure arithmetic rewrite here.
  const updates: Array<{ id: string; amount: number }> = [];
  for (const row of unpaidOverrides) {
    if (!row.sourceCommission) continue;
    const amount = calculateOverrideAmount(nextRule, row.sourceCommission);
    if (Math.abs(amount - toNumber(row.amount)) < 0.005) continue;
    updates.push({ id: row.id, amount });
  }

  const CHUNK = 500;
  let written = 0;

  for (let start = 0; start < updates.length; start += CHUNK) {
    const chunk = updates.slice(start, start + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (row) =>
          Prisma.sql`(${row.id}::text, ${row.amount.toFixed(2)}::numeric)`
      )
    );

    written += await prisma.$executeRaw`
      UPDATE "LedgerEntry" AS le
      SET "amount" = v.amount, "updatedAt" = NOW()
      FROM (VALUES ${values}) AS v(id, amount)
      WHERE le."id" = v.id
        AND le."status" IN ('UNPAID', 'PENDING')
    `;

    console.log(`  repriced ${Math.min(start + CHUNK, updates.length)}/${updates.length}`);
  }

  const after = await prisma.ledgerEntry.aggregate({
    where: {
      dealRuleId: rule.id,
      type: "OVERRIDE",
      status: { in: ["UNPAID", "PENDING"] },
    },
    _sum: { amount: true },
    _count: true,
  });

  console.log(`\nApplied. Repriced ${written} rows.`);
  console.log(
    `Unpaid/pending overrides now: ${after._count} rows  $${Number(after._sum.amount ?? 0).toFixed(2)}`
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
