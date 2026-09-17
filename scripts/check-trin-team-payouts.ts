import { config } from "dotenv";
import { PayoutBatchStatus } from "@prisma/client";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

function money(v: number) {
  return `$${v.toFixed(2)}`;
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

  console.log("=".repeat(72));
  console.log("TRIN TEAM PAYOUT STATUS");
  console.log("=".repeat(72));

  const overrideByStatus = await prisma.ledgerEntry.groupBy({
    by: ["status"],
    where: { affiliateId: trin.id, type: "OVERRIDE" },
    _sum: { amount: true },
    _count: true,
  });
  console.log("\nOverride ledger by status:");
  for (const row of overrideByStatus) {
    console.log(
      `  ${row.status.padEnd(10)} ${String(row._count).padStart(5)} rows  ${money(toNumber(row._sum.amount))}`
    );
  }

  const teamBatches = await prisma.payoutBatch.findMany({
    where: {
      status: PayoutBatchStatus.COMPLETED,
      ledgerEntries: {
        some: { affiliateId: trin.id, type: "OVERRIDE" },
      },
    },
    orderBy: { processedAt: "desc" },
    select: {
      id: true,
      label: true,
      processedAt: true,
      createdAt: true,
      items: {
        where: { affiliateId: trin.id },
        select: { totalAmount: true, entryCount: true },
      },
    },
  });
  console.log(`\nPlatform team payout batches (COMPLETED): ${teamBatches.length}`);
  for (const b of teamBatches) {
    const item = b.items[0];
    console.log(
      `  ${(b.processedAt ?? b.createdAt).toISOString().slice(0, 10)}  ${b.label}  ${money(toNumber(item?.totalAmount))}  (${item?.entryCount ?? 0} rows)`
    );
  }

  const options = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff: new Date(),
  });
  console.log(`\nCurrent payout picker: ${options.teams[0]?.members.length ?? 0} rows`);
  console.log(`  Total payable: ${money(options.teams[0]?.amount ?? 0)}`);
  console.log(
    `  Awaiting recruit direct: ${money(options.awaitingDirectPayout.amount)} (${options.awaitingDirectPayout.entryCount} rows)`
  );
  console.log(`  Unattributed: ${money(options.unattributed.amount)}`);

  for (const row of options.teams[0]?.members ?? []) {
    console.log(
      `  · ${row.label.padEnd(18)} ${money(row.amount).padStart(12)}  ${row.sublabel}`
    );
  }

  for (const slicewpId of [81, 138, 124]) {
    const member = await prisma.affiliate.findFirst({
      where: { slicewpId },
      select: { id: true, displayName: true },
    });
    if (!member) continue;
    const anchors = await listDirectPayoutAnchorsForMember(member.id, 5);
    console.log(`\n${member.displayName} — latest direct payouts:`);
    for (const a of anchors.slice(0, 3)) {
      console.log(
        `  ${a.paidAt.toISOString().slice(0, 10)}  ${money(a.amount)}  ${a.entryCount} commissions  ${a.label}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
