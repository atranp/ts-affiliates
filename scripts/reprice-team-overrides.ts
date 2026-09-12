import { config } from "dotenv";
import { DealBasis } from "@prisma/client";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Reprices unpaid team overrides off the commissionable base.
 *
 * The deal is a share of the recruit's sales; it was being taken from the gross
 * order total, which includes shipping and tax nobody earns a commission on.
 * Paid rows are left alone — they record money that already moved.
 *
 * Recomputes commissionBase from whatever order totals are on file first, so
 * this is safe to re-run after a Woo totals backfill.
 *
 *   npx tsx scripts/reprice-team-overrides.ts            # dry run
 *   npx tsx scripts/reprice-team-overrides.ts --apply
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
  const { syncCommissionBases, syncLedgerCommissionBases } = await import(
    "../lib/sync-write"
  );

  const m = (v: number) => `$${v.toFixed(2)}`;

  if (apply) {
    const bases = await syncCommissionBases();
    const mirrored = await syncLedgerCommissionBases();
    console.log(
      `commissionBase: ${bases} commissions computed, ${mirrored} ledger lines mirrored\n`
    );
  }

  const total = await prisma.commission.count({
    where: { orderRevenue: { not: null }, status: { in: ["UNPAID", "PAID"] } },
  });
  const withBase = await prisma.commission.count({
    where: {
      orderRevenue: { not: null },
      status: { in: ["UNPAID", "PAID"] },
      commissionBase: { not: null },
    },
  });
  console.log(
    `commissionable base known for ${withBase}/${total} sales (${((withBase / total) * 100).toFixed(1)}%)\n`
  );

  const rules = await prisma.dealRule.findMany({
    where: { active: true, teamId: { not: null } },
    select: {
      id: true,
      name: true,
      basis: true,
      ratePercent: true,
      metadata: true,
    },
  });

  for (const rule of rules) {
    const needsBasisFix =
      rule.basis !== DealBasis.ORDER_REVENUE || rule.metadata !== null;

    console.log(`=== ${rule.name} ===`);
    console.log(
      `  basis ${rule.basis} @ ${rule.ratePercent.toString()}%${
        rule.metadata ? `  metadata ${JSON.stringify(rule.metadata)}` : ""
      }${needsBasisFix ? "  → will reset to ORDER_REVENUE, no metadata" : ""}`
    );

    const rows = await prisma.ledgerEntry.findMany({
      where: {
        dealRuleId: rule.id,
        type: "OVERRIDE",
        status: { in: ["UNPAID", "PENDING"] },
      },
      select: {
        id: true,
        amount: true,
        sourceCommission: {
          select: { amount: true, orderRevenue: true, commissionBase: true },
        },
      },
    });

    const priced = { basis: DealBasis.ORDER_REVENUE, ratePercent: rule.ratePercent };

    const updates: Array<{ id: string; amount: number }> = [];
    let oldTotal = 0;
    let newTotal = 0;

    for (const row of rows) {
      if (!row.sourceCommission) continue;
      const next = calculateOverrideAmount(priced, row.sourceCommission);
      oldTotal += toNumber(row.amount);
      newTotal += next;
      if (Math.abs(next - toNumber(row.amount)) >= 0.005) {
        updates.push({ id: row.id, amount: next });
      }
    }

    console.log(
      `  unpaid/pending: ${rows.length} rows · ${m(oldTotal)} → ${m(newTotal)} (${m(newTotal - oldTotal)}) · ${updates.length} change`
    );

    if (!apply) continue;

    // The divisor convention is gone from the pricing code, so a rule left on
    // RECRUIT_COMMISSION would pay a tenth of the commission rather than a
    // third — worth correcting on its own, ahead of any repricing.
    if (needsBasisFix && process.argv.includes("--basis-only")) {
      await prisma.dealRule.update({
        where: { id: rule.id },
        data: { basis: DealBasis.ORDER_REVENUE, metadata: Prisma.DbNull },
      });
      console.log("  basis reset; amounts left alone (--basis-only)");
      continue;
    }

    if (needsBasisFix) {
      await prisma.dealRule.update({
        where: { id: rule.id },
        data: { basis: DealBasis.ORDER_REVENUE, metadata: Prisma.DbNull },
      });
    }

    const CHUNK = 500;
    let written = 0;
    for (let start = 0; start < updates.length; start += CHUNK) {
      const chunk = updates.slice(start, start + CHUNK);
      const values = Prisma.join(
        chunk.map(
          (row) => Prisma.sql`(${row.id}::text, ${row.amount.toFixed(2)}::numeric)`
        )
      );
      written += await prisma.$executeRaw`
        UPDATE "LedgerEntry" AS le
        SET "amount" = v.amount, "updatedAt" = NOW()
        FROM (VALUES ${values}) AS v(id, amount)
        WHERE le."id" = v.id
          AND le."status" IN ('UNPAID', 'PENDING')
      `;
    }

    console.log(`  repriced ${written} rows`);
  }

  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
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
