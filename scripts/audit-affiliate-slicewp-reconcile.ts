import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: will an affiliate's SliceWP payout cross-check against the portal?
 *
 * They typically open a paid receipt in SliceWP and compare commission totals
 * and sale values to what the portal shows. This surfaces where those agree
 * and where the labels diverge.
 */

const AFFILIATES = [
  { slicewpId: 81, email: "blair@blairswish.com", role: "recruit" },
  { slicewpId: 138, email: "emmiepayton1@gmail.com", role: "recruit" },
  { slicewpId: 51, email: "trindalyn.mackenzie11@gmail.com", role: "sponsor" },
];

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getAffiliatePerformance } = await import("../lib/affiliate/performance");
  const { resolvePeriod } = await import("../lib/affiliate/period");
  const { getSlicewpPayoutDetail } = await import("../lib/payouts/slicewp-queries");
  const { getPayoutOptions } = await import("../lib/payouts/options");

  console.log("=== Affiliate SliceWP ↔ portal reconciliation ===\n");

  for (const spec of AFFILIATES) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId: spec.slicewpId },
      select: { id: true, displayName: true, email: true },
    });
    if (!affiliate) continue;

    console.log("─".repeat(72));
    console.log(`${affiliate.displayName} (#${spec.slicewpId}) · ${spec.role}`);
    console.log("─".repeat(72));

    const { range, previous } = resolvePeriod({ key: "all" });
    const perf = await getAffiliatePerformance(affiliate.id, range, previous);

    // Home stat: commissionable sales generated (DIRECT ledger only)
    const ledgerDirect = await prisma.ledgerEntry.aggregate({
      where: { affiliateId: affiliate.id, type: "DIRECT" },
      _sum: {
        amount: true,
        orderRevenue: true,
        commissionBase: true,
      },
      _count: true,
    });

    const grossOnLedger = toNumber(ledgerDirect._sum.orderRevenue);
    const netOnLedger =
      (await prisma.$queryRaw<[{ net: number }]>`
        SELECT COALESCE(SUM(COALESCE("commissionBase", "orderRevenue")), 0)::float AS net
        FROM "LedgerEntry"
        WHERE "affiliateId" = ${affiliate.id} AND "type" = 'DIRECT'
      `)[0]?.net ?? 0;

    console.log("\n  HOME · Commissionable sales generated");
    console.log(`    portal shows:           ${money(perf.current.revenue)}`);
    console.log(`    ledger net sum:         ${money(netOnLedger)}`);
    console.log(`    ledger gross (SliceWP): ${money(grossOnLedger)}`);
    console.log(
      `    gap net vs gross:       ${money(netOnLedger - grossOnLedger)} (${ledgerDirect._count} direct rows)`
    );

    // Latest paid SliceWP payout
    const payment = await prisma.slicewpPayment.findFirst({
      where: { affiliateId: affiliate.id, status: "paid" },
      orderBy: { dateCreated: "desc" },
      select: {
        id: true,
        slicewpPaymentId: true,
        amount: true,
        commissionIds: true,
        dateCreated: true,
      },
    });

    if (!payment) {
      console.log("\n  No paid SliceWP payouts on file.");
      console.log("");
      continue;
    }

    const commissions = await prisma.commission.findMany({
      where: {
        affiliateId: affiliate.id,
        slicewpId: { in: payment.commissionIds },
      },
      select: {
        amount: true,
        orderRevenue: true,
        commissionBase: true,
      },
    });

    const commSum = commissions.reduce((s, c) => s + toNumber(c.amount), 0);
    const grossSum = commissions.reduce(
      (s, c) => s + toNumber(c.orderRevenue),
      0
    );
    const netSum = commissions.reduce(
      (s, c) => s + toNumber(c.commissionBase ?? c.orderRevenue),
      0
    );

    const detail = await getSlicewpPayoutDetail(payment.id, {
      affiliateId: affiliate.id,
    });
    const detailSaleSum =
      detail?.entries.reduce((s, e) => s + (e.orderRevenue ?? 0), 0) ?? 0;

    console.log(`\n  LATEST SLICEWP PAYOUT · #${payment.slicewpPaymentId} · ${payment.dateCreated.toISOString().slice(0, 10)}`);
    console.log(`    SliceWP payment amount: ${money(toNumber(payment.amount))}`);
    console.log(`    Σ commission amounts:   ${money(commSum)}  gap ${money(toNumber(payment.amount) - commSum)}`);
    console.log(`    Σ gross reference_amt:  ${money(grossSum)}  (what SliceWP stores per sale)`);
    console.log(`    Σ commissionable base:  ${money(netSum)}`);
    console.log(
      `    portal payout detail shows sale column sum: ${money(detailSaleSum)}` +
        (Math.abs(detailSaleSum - grossSum) < 0.02 ? " (= gross)" : " ⚠ mismatch")
    );

    // Implied rate check: commission / sale base
    if (netSum > 0) {
      console.log(
        `    implied rate on net sales:  ${((commSum / netSum) * 100).toFixed(2)}%`
      );
    }
    if (grossSum > 0) {
      console.log(
        `    implied rate on gross:      ${((commSum / grossSum) * 100).toFixed(2)}%  ← SliceWP-style if they divide by gross`
      );
    }

    if (spec.role === "sponsor") {
      const options = await getPayoutOptions({
        affiliateId: affiliate.id,
        cutoff: new Date(),
      });
      const team = options.teams[0];
      if (team) {
        console.log(`\n  TEAM PAYOUT OPTIONS (unpaid, ${team.members.length} rows)`);
        console.log(`    total team cut ready: ${money(team.amount)}`);
        const sample = team.members[0];
        if (sample) {
          console.log(`    sample: ${sample.label} · ${sample.sublabel}`);
          console.log(`    math line: ${sample.math}`);
          console.log(`    amount: ${money(sample.amount)}`);
        }
      }
    }

    console.log("");
  }

  // Cross-check: do ledger DIRECT amounts match Commission for Blair?
  console.log("─".repeat(72));
  console.log("LEDGER vs COMMISSION (direct amounts should mirror SliceWP)");
  console.log("─".repeat(72));

  for (const spec of AFFILIATES.filter((a) => a.role === "recruit")) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId: spec.slicewpId },
      select: { id: true, displayName: true },
    });
    if (!affiliate) continue;

    const mismatches = await prisma.$queryRaw<
      Array<{ n: bigint; amount_gap: number; sale_gross_gap: number }>
    >`
      SELECT
        COUNT(*)::bigint AS n,
        COALESCE(SUM(ABS(le."amount" - c."amount")), 0)::float AS amount_gap,
        COALESCE(SUM(ABS(COALESCE(le."orderRevenue", 0) - COALESCE(c."orderRevenue", 0))), 0)::float AS sale_gross_gap
      FROM "LedgerEntry" le
      JOIN "Commission" c ON c."id" = le."sourceCommissionId"
      WHERE le."affiliateId" = ${affiliate.id}
        AND le."type" = 'DIRECT'
        AND (
          le."amount" IS DISTINCT FROM c."amount"
          OR le."orderRevenue" IS DISTINCT FROM c."orderRevenue"
        )
    `;

    const baseDrift = await prisma.$queryRaw<[{ n: bigint; gap: number }]>`
      SELECT COUNT(*)::bigint AS n,
        COALESCE(SUM(ABS(COALESCE(le."commissionBase", le."orderRevenue") - COALESCE(c."commissionBase", c."orderRevenue"))), 0)::float AS gap
      FROM "LedgerEntry" le
      JOIN "Commission" c ON c."id" = le."sourceCommissionId"
      WHERE le."affiliateId" = ${affiliate.id}
        AND le."type" = 'DIRECT'
        AND COALESCE(le."commissionBase", le."orderRevenue") IS DISTINCT FROM COALESCE(c."commissionBase", c."orderRevenue")
    `;

    console.log(
      `\n  ${affiliate.displayName}: ` +
        `${mismatches[0]?.n ?? 0} rows where ledger ≠ commission on amount/gross; ` +
        `${baseDrift[0]?.n ?? 0} rows where commissionable base differs between ledger and commission`
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
