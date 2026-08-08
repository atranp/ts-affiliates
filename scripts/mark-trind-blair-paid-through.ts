/**
 * One-off: mark Trindalyn's team earnings (OVERRIDE) from Blair's sales as PAID
 * through Monday Jul 28, 2026 (store timezone).
 *
 * Usage: npx tsx scripts/mark-trind-blair-paid-through.ts
 */
import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { config } from "dotenv";
import { endOfStoreDay, parseStoreDateInput } from "../lib/payouts/store-dates";

config({ path: ".env" });
config({ path: ".env.local", override: true });

const CUTOFF_DATE = "2026-07-28";

async function main() {
  const { prisma } = await import("../lib/prisma");

  const trind = await prisma.affiliate.findFirst({
    where: {
      OR: [
        { email: { contains: "trindalyn", mode: "insensitive" } },
        { displayName: { contains: "trindalyn", mode: "insensitive" } },
      ],
    },
    select: { id: true, displayName: true, email: true },
  });

  const blair = await prisma.affiliate.findFirst({
    where: {
      OR: [
        { email: { contains: "blair", mode: "insensitive" } },
        { displayName: { contains: "blair", mode: "insensitive" } },
      ],
    },
    select: { id: true, displayName: true, email: true },
  });

  if (!trind || !blair) {
    throw new Error(
      `Missing affiliate(s): trind=${trind?.email ?? "not found"}, blair=${blair?.email ?? "not found"}`
    );
  }

  const cutoff = endOfStoreDay(parseStoreDateInput(CUTOFF_DATE));
  const paidAt = cutoff;

  const where = {
    affiliateId: trind.id,
    sourceAffiliateId: blair.id,
    type: LedgerEntryType.OVERRIDE,
    status: CommissionStatus.UNPAID,
    occurredAt: { lte: cutoff },
  };

  const preview = await prisma.ledgerEntry.findMany({
    where,
    select: { id: true, amount: true, occurredAt: true, description: true },
    orderBy: { occurredAt: "asc" },
  });

  const total = preview.reduce((sum, row) => sum + Number(row.amount), 0);

  console.log("Affiliates:");
  console.log(`  Sponsor: ${trind.displayName} <${trind.email}> (${trind.id})`);
  console.log(`  Source:  ${blair.displayName} <${blair.email}> (${blair.id})`);
  console.log(`Cutoff: sale occurredAt <= ${cutoff.toISOString()} (Mon ${CUTOFF_DATE} PT end of day)`);
  console.log(`Entries to mark PAID: ${preview.length}`);
  console.log(`Total UNPAID team earnings: $${total.toFixed(2)}`);

  if (preview.length === 0) {
    console.log("Nothing to update.");
    await prisma.$disconnect();
    return;
  }

  const result = await prisma.ledgerEntry.updateMany({
    where,
    data: {
      status: CommissionStatus.PAID,
      paidAt,
    },
  });

  console.log(`Updated ${result.count} ledger entries to PAID.`);

  const remaining = await prisma.ledgerEntry.count({
    where: {
      affiliateId: trind.id,
      sourceAffiliateId: blair.id,
      type: LedgerEntryType.OVERRIDE,
      status: CommissionStatus.UNPAID,
    },
  });
  console.log(`Remaining UNPAID Blair overrides for Trind: ${remaining}`);

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
