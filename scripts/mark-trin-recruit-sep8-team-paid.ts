/**
 * Mark Trin's UNPAID team overrides tied to a recruit's Sep 8, 2026 direct
 * payout as PAID (settled outside the portal).
 *
 *   npx tsx scripts/mark-trin-recruit-sep8-team-paid.ts              # dry run all
 *   npx tsx scripts/mark-trin-recruit-sep8-team-paid.ts --apply        # apply all
 *   npx tsx scripts/mark-trin-recruit-sep8-team-paid.ts --apply --member 81
 */
import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { config } from "dotenv";
import { formatInTimeZone } from "date-fns-tz";
import { prodDatabaseUrl } from "./prod-env";
import { APP_TIMEZONE } from "../lib/timezone";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

const ANCHOR_DATE = "2026-09-08";
const RECRUITS = [
  { slicewpId: 81, name: "Blair Rodgers" },
  { slicewpId: 138, name: "Emmie Payton" },
];

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const memberFlag = process.argv.indexOf("--member");
  const memberFilter =
    memberFlag >= 0 ? Number(process.argv[memberFlag + 1]) : null;

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
  if (!trin) throw new Error("Trin not found");

  const targets = RECRUITS.filter(
    (r) => memberFilter == null || r.slicewpId === memberFilter
  );

  console.log(`Anchor date: ${ANCHOR_DATE}  Mode: ${apply ? "APPLY" : "dry run"}\n`);

  for (const spec of targets) {
    const member = await prisma.affiliate.findFirst({
      where: { slicewpId: spec.slicewpId },
      select: { id: true, displayName: true },
    });
    if (!member) {
      console.log(`${spec.name}: not found, skipping`);
      continue;
    }

    const anchors = await listDirectPayoutAnchorsForMember(member.id, 5);
    const anchor = anchors.find(
      (a) =>
        formatInTimeZone(a.paidAt, APP_TIMEZONE, "yyyy-MM-dd") === ANCHOR_DATE
    );
    if (!anchor) {
      console.log(`${spec.name}: no ${ANCHOR_DATE} direct anchor, skipping`);
      continue;
    }

    const unpaid = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trin.id,
        type: LedgerEntryType.OVERRIDE,
        status: CommissionStatus.UNPAID,
        sourceAffiliateId: member.id,
        sourceCommissionId: { in: anchor.commissionIds },
      },
      select: { id: true, amount: true },
    });

    const total = unpaid.reduce((s, r) => s + toNumber(r.amount), 0);
    console.log(`${member.displayName ?? spec.name}:`);
    console.log(`  ${anchor.label}`);
    console.log(`  ${unpaid.length} rows  ${money(total)}`);

    if (apply && unpaid.length > 0) {
      const result = await prisma.ledgerEntry.updateMany({
        where: {
          id: { in: unpaid.map((r) => r.id) },
          status: CommissionStatus.UNPAID,
        },
        data: { status: CommissionStatus.PAID, paidAt: anchor.paidAt },
      });
      console.log(`  → marked ${result.count} PAID`);
    }
    console.log();
  }

  const options = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff: new Date(),
  });
  console.log(
    `Payout picker: ${options.teams[0]?.members.length ?? 0} rows  ${money(options.teams[0]?.amount ?? 0)}`
  );
  for (const row of options.teams[0]?.members ?? []) {
    console.log(`  · ${row.label}  ${money(row.amount)}  ${row.sublabel}`);
  }
  if ((options.teams[0]?.members.length ?? 0) === 0) {
    console.log("  (empty until next recruit direct payouts land)");
  }

  if (!apply) console.log("\nRe-run with --apply to write.");

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
