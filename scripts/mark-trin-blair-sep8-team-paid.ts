/**
 * Mark Trin's UNPAID Blair team overrides tied to Blair's Sep 8, 2026 direct
 * payout as PAID (settled outside the portal).
 *
 *   npx tsx scripts/mark-trin-blair-sep8-team-paid.ts          # dry run
 *   npx tsx scripts/mark-trin-blair-sep8-team-paid.ts --apply
 */
import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { config } from "dotenv";
import { formatInTimeZone } from "date-fns-tz";
import { prodDatabaseUrl } from "./prod-env";
import { APP_TIMEZONE } from "../lib/timezone";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  const blair = await prisma.affiliate.findFirst({
    where: { slicewpId: 81 },
    select: { id: true, displayName: true },
  });
  if (!trin || !blair) throw new Error("Missing affiliate");

  const anchors = await listDirectPayoutAnchorsForMember(blair.id, 3);
  const sep8 = anchors.find(
    (a) => formatInTimeZone(a.paidAt, APP_TIMEZONE, "yyyy-MM-dd") === "2026-09-08"
  );
  if (!sep8) throw new Error("Blair Sep 8 direct anchor not found");

  const commissionIds = new Set(sep8.commissionIds);
  console.log(
    `Anchor: ${sep8.label}  (${sep8.commissionIds.length} commissions)`
  );
  console.log(`Mode: ${apply ? "APPLY" : "dry run"}\n`);

  const unpaid = await prisma.ledgerEntry.findMany({
    where: {
      affiliateId: trin.id,
      type: LedgerEntryType.OVERRIDE,
      status: CommissionStatus.UNPAID,
      sourceAffiliateId: blair.id,
      sourceCommissionId: { in: Array.from(commissionIds) },
    },
    select: { id: true, amount: true },
  });

  const total = unpaid.reduce((s, r) => s + toNumber(r.amount), 0);
  console.log(`Rows to mark PAID: ${unpaid.length}  ${money(total)}`);

  if (!apply) {
    const options = await getPayoutOptions({
      affiliateId: trin.id,
      cutoff: new Date(),
    });
    const blairRows =
      options.teams[0]?.members.filter((m) => m.label.includes("Blair")) ?? [];
    console.log(`\nPayout picker Blair rows now: ${blairRows.length}`);
    for (const row of blairRows) console.log(`  ${money(row.amount)}  ${row.sublabel}`);
    console.log("\nRe-run with --apply to write.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.ledgerEntry.updateMany({
    where: {
      id: { in: unpaid.map((r) => r.id) },
      status: CommissionStatus.UNPAID,
    },
    data: { status: CommissionStatus.PAID, paidAt: sep8.paidAt },
  });
  console.log(`\nUpdated ${result.count} rows to PAID.`);

  const options = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff: new Date(),
  });
  const blairRows =
    options.teams[0]?.members.filter((m) => m.label.includes("Blair")) ?? [];
  console.log(`Payout picker Blair rows now: ${blairRows.length}`);
  for (const row of blairRows) console.log(`  ${money(row.amount)}  ${row.sublabel}`);
  if (blairRows.length === 0) {
    console.log("  (none — next Blair row appears when his next direct payout lands)");
  }

  const remaining = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: LedgerEntryType.OVERRIDE,
      status: CommissionStatus.UNPAID,
      sourceAffiliateId: blair.id,
    },
    _sum: { amount: true },
    _count: true,
  });
  console.log(
    `\nBlair roster unpaid team cut now: ${money(toNumber(remaining._sum.amount))} (${remaining._count} rows)`
  );

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
