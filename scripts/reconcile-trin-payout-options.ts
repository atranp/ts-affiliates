import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: does each Trin team payout row match Gavin's spreadsheet math?
 *
 * For every recruit direct receipt on SliceWP, the sponsor's cut should be the
 * sum of (that recruit's commission on each sale ÷ 3), rounded per sale — not
 * necessarily the receipt total ÷ 3, because rounding happens per row.
 */

const MEMBERS = [
  { slicewpId: 81, name: "Blair Rodgers" },
  { slicewpId: 138, name: "Emmie Payton" },
  { slicewpId: 124, name: "Dd Perez" },
];

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

function roundCurrency(v: number) {
  return Math.round(v * 100) / 100;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const cutoff = new Date();
  const options = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff,
  });

  const team = options.teams.find((t) =>
    t.label.toLowerCase().includes("downline")
  );
  if (!team) {
    console.log("No downline team options found.");
    return;
  }

  console.log(
    `=== ${team.label.toUpperCase()} · portal total ${money(team.amount)} ===\n`
  );

  // Index portal rows by member + direct payout label fragment
  const portalRows = team.members;

  let portalSum = 0;
  let gavinSum = 0;
  let issues = 0;

  for (const row of portalRows) {
    portalSum += row.amount;

    const memberSlicewp = MEMBERS.find((m) => row.label.includes(m.name.split(" ")[0]!));
    const member = memberSlicewp
      ? await prisma.affiliate.findFirst({
          where: { slicewpId: memberSlicewp.slicewpId },
          select: { id: true, displayName: true, slicewpId: true },
        })
      : null;

    let slicePayment: {
      amount: number;
      commissionIds: number[];
      dateCreated: Date;
      slicewpPaymentId: number;
    } | null = null;

    let sourceCommissionTotal = 0;
    let gavinTotal = 0;
    let grossSales = 0;
    let netSales = 0;
    let saleCount = 0;

    if (member && row.target.scope === "member" && row.target.directPayout) {
      const ref = row.target.directPayout;
      let commissionIds: string[] = [];

      if (ref.source === "slicewp") {
        const payment = await prisma.slicewpPayment.findFirst({
          where: { id: ref.paymentId },
          select: {
            amount: true,
            commissionIds: true,
            dateCreated: true,
            slicewpPaymentId: true,
            affiliateId: true,
          },
        });
        if (payment) {
          slicePayment = {
            amount: toNumber(payment.amount),
            commissionIds: payment.commissionIds,
            dateCreated: payment.dateCreated,
            slicewpPaymentId: payment.slicewpPaymentId,
          };
          const commissions = await prisma.commission.findMany({
            where: {
              affiliateId: member.id,
              slicewpId: { in: payment.commissionIds },
            },
            select: { id: true, amount: true, orderRevenue: true, commissionBase: true },
          });
          commissionIds = commissions.map((c) => c.id);
          for (const c of commissions) {
            const amt = toNumber(c.amount);
            sourceCommissionTotal += amt;
            gavinTotal += roundCurrency(amt / 3);
            grossSales += toNumber(c.orderRevenue);
            netSales += toNumber(c.commissionBase ?? c.orderRevenue);
            saleCount += 1;
          }
        }
      } else {
        const entries = await prisma.ledgerEntry.findMany({
          where: {
            payoutBatchId: ref.batchId,
            affiliateId: member.id,
            type: "DIRECT",
          },
          select: { sourceCommissionId: true },
        });
        commissionIds = entries
          .map((e) => e.sourceCommissionId)
          .filter((id): id is string => !!id);

        const commissions = await prisma.commission.findMany({
          where: { id: { in: commissionIds } },
          select: { id: true, amount: true, orderRevenue: true, commissionBase: true },
        });
        for (const c of commissions) {
          const amt = toNumber(c.amount);
          sourceCommissionTotal += amt;
          gavinTotal += roundCurrency(amt / 3);
          grossSales += toNumber(c.orderRevenue);
          netSales += toNumber(c.commissionBase ?? c.orderRevenue);
          saleCount += 1;
        }
      }

      // Cross-check: do SliceWP payment commission ids match what we priced?
      if (slicePayment && saleCount !== slicePayment.commissionIds.length) {
        console.log(
          `  ⚠ ${row.label}: only ${saleCount}/${slicePayment.commissionIds.length} commissions found in portal DB`
        );
      }
    }

    gavinSum += gavinTotal;

    const receiptDiv3 = slicePayment ? roundCurrency(slicePayment.amount / 3) : null;
    const commissionDiv3 = gavinTotal > 0 ? gavinTotal : null;
    const gapVsGavin = commissionDiv3 !== null ? row.amount - commissionDiv3 : null;
    const gapVsReceipt = receiptDiv3 !== null ? row.amount - receiptDiv3 : null;

    const ok =
      gapVsGavin !== null && Math.abs(gapVsGavin) < 0.02;

    if (!ok) issues += 1;

    console.log(`${ok ? "✓" : "✗"} ${row.label}`);
    console.log(`    portal row:  ${money(row.amount)}  (${row.entryCount} sales, sales line ${money(row.revenue)})`);
    console.log(`    ${row.sublabel}`);
    console.log(`    ${row.math ?? "(no math)"}`);
    if (slicePayment) {
      console.log(
        `    SliceWP payment #${slicePayment.slicewpPaymentId}: ${money(slicePayment.amount)} ` +
          `(${slicePayment.commissionIds.length} commission ids)`
      );
    }
    if (sourceCommissionTotal > 0) {
      console.log(
        `    recruit commission sum: ${money(sourceCommissionTotal)}  ` +
          `÷3 per-row = ${money(gavinTotal)}  ` +
          `receipt ÷3 = ${receiptDiv3 !== null ? money(receiptDiv3) : "—"}`
      );
      console.log(
        `    sales in payment: gross ${money(grossSales)}  net ${money(netSales)}  ` +
          `(portal revenue line uses net)`
      );
    }
    if (gapVsGavin !== null) {
      console.log(
        `    gap vs Gavin (per-row ÷3): ${gapVsGavin >= 0 ? "+" : ""}${money(gapVsGavin)}` +
          (gapVsReceipt !== null
            ? `  ·  gap vs receipt÷3: ${gapVsReceipt >= 0 ? "+" : ""}${money(gapVsReceipt)}`
            : "")
      );
    }
    console.log("");
  }

  console.log("--- totals ---");
  console.log(`  portal picker total:     ${money(portalSum)}`);
  console.log(`  Gavin per-row ÷3 sum:    ${money(gavinSum)}`);
  console.log(`  gap:                     ${money(portalSum - gavinSum)}`);
  console.log(`  rows with issues:        ${issues}/${portalRows.length}`);

  // Sanity: compare anchors for each member against unpaid override inventory
  console.log("\n--- anchor inventory (SliceWP direct payments) ---");
  for (const m of MEMBERS) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId: m.slicewpId },
      select: { id: true },
    });
    if (!affiliate) continue;

    const anchors = await listDirectPayoutAnchorsForMember(affiliate.id);
    const unpaidOverrides = await prisma.ledgerEntry.aggregate({
      where: {
        affiliateId: trin.id,
        type: "OVERRIDE",
        status: "UNPAID",
        sourceAffiliateId: affiliate.id,
      },
      _sum: { amount: true },
      _count: true,
    });

    console.log(
      `  ${m.name}: ${anchors.length} paid direct receipts on file, ` +
        `${unpaidOverrides._count} unpaid overrides sourced from them (${money(toNumber(unpaidOverrides._sum.amount))})`
    );
    for (const a of anchors.slice(0, 6)) {
      console.log(`    · ${a.label} · ${a.commissionIds.length} sales`);
    }
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
