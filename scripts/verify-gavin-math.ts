import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: does the portal's team cut equal the payout spreadsheet's figure?
 *
 * The spreadsheet recovers the sale from what the recruit was paid — assume 30%,
 * divide, take 10% — which is the commission divided by three. Summing that per
 * sale and dividing the total give the same answer, so any gap beyond rounding
 * means the portal is pricing something the spreadsheet isn't, or the reverse.
 */

async function main() {
  const { prisma } = await import("../lib/prisma");

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const overrides = await prisma.ledgerEntry.findMany({
    where: { affiliateId: trin.id, type: "OVERRIDE" },
    select: {
      status: true,
      amount: true,
      sourceAffiliate: { select: { slicewpId: true, displayName: true } },
      sourceCommission: { select: { amount: true } },
    },
  });

  type Bucket = { rows: number; cut: number; commission: number };
  const byMember = new Map<string, Bucket>();
  const byStatus = new Map<string, number>();

  for (const row of overrides) {
    const who = `#${row.sourceAffiliate?.slicewpId ?? "?"} ${row.sourceAffiliate?.displayName ?? "?"}`;
    const bucket = byMember.get(who) ?? { rows: 0, cut: 0, commission: 0 };
    bucket.rows += 1;
    bucket.cut += Number(row.amount);
    bucket.commission += Number(row.sourceCommission?.amount ?? 0);
    byMember.set(who, bucket);

    byStatus.set(row.status, (byStatus.get(row.status) ?? 0) + Number(row.amount));
  }

  console.log("Trin's team cut, portal vs spreadsheet (commission ÷ 3):\n");
  let totalCut = 0;
  let totalCommission = 0;

  for (const [who, b] of Array.from(byMember.entries()).sort(
    (a, b) => b[1].cut - a[1].cut
  )) {
    const expected = b.commission / 3;
    const gap = b.cut - expected;
    totalCut += b.cut;
    totalCommission += b.commission;
    console.log(
      `  ${who.padEnd(24)} ${String(b.rows).padStart(5)} rows  ` +
        `their commission $${b.commission.toFixed(2).padStart(11)}  ` +
        `÷3 = $${expected.toFixed(2).padStart(10)}  ` +
        `portal $${b.cut.toFixed(2).padStart(10)}  ` +
        `gap $${gap.toFixed(2)}`
    );
  }

  console.log(
    `\n  ${"TOTAL".padEnd(24)} ${String(overrides.length).padStart(5)} rows  ` +
      `their commission $${totalCommission.toFixed(2)}  ` +
      `÷3 = $${(totalCommission / 3).toFixed(2)}  portal $${totalCut.toFixed(2)}  ` +
      `gap $${(totalCut - totalCommission / 3).toFixed(2)}`
  );

  console.log("\nby status:");
  for (const [status, amount] of Array.from(byStatus.entries()).sort()) {
    console.log(`  ${status.padEnd(10)} $${amount.toFixed(2)}`);
  }

  const rule = await prisma.dealRule.findFirst({
    where: { sponsorAffiliateId: trin.id, active: true, teamId: { not: null } },
    select: { basis: true, ratePercent: true, metadata: true },
  });
  console.log(
    `\nrule: ${rule?.basis} @ ${rule?.ratePercent.toString()}% ` +
      `metadata ${JSON.stringify(rule?.metadata)}`
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
