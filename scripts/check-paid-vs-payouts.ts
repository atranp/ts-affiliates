import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Read-only. Compares the two "how much have I been paid" figures the portal
 * shows the same affiliate: the ledger's PAID total on the Commissions tab,
 * and the receipts listed on the Payouts tab.
 *
 * They come from different tables, so they drift whenever a ledger entry is
 * marked PAID without a matching receipt. On screen that reads as the portal
 * contradicting itself about money the affiliate is owed.
 */

const EMAILS = [
  "blair@blairswish.com",
  "trindalyn.mackenzie11@gmail.com",
  "emmiepayton1@gmail.com",
];

const money = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

async function main() {
  const url = prodDatabaseUrl();
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient({ datasources: { db: { url } } });

  const toNumber = (value: unknown) =>
    value instanceof Prisma.Decimal ? value.toNumber() : Number(value ?? 0);

  for (const email of EMAILS) {
    const profile = await prisma.profile.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
      select: { affiliateId: true },
    });
    if (!profile?.affiliateId) {
      console.log(`\n${email}: no affiliate linked`);
      continue;
    }
    const affiliateId = profile.affiliateId;

    const paid = await prisma.ledgerEntry.aggregate({
      where: { affiliateId, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    });
    const paidTotal = toNumber(paid._sum.amount);

    const payments = await prisma.slicewpPayment.findMany({
      where: { affiliateId },
      select: { amount: true },
    });
    const paymentsTotal = payments.reduce((s, p) => s + toNumber(p.amount), 0);

    const items = await prisma.payoutBatchItem.findMany({
      where: { affiliateId },
      select: { totalAmount: true },
    });
    const itemsTotal = items.reduce((s, i) => s + toNumber(i.totalAmount), 0);

    const noBatch = await prisma.ledgerEntry.aggregate({
      where: { affiliateId, status: "PAID", payoutBatchId: null },
      _sum: { amount: true },
      _count: true,
    });

    // Overrides never reach SliceWP: only DIRECT entries map to a commission
    // there, so team earnings marked paid have no receipt by design.
    const byType = await prisma.ledgerEntry.groupBy({
      by: ["type"],
      where: { affiliateId, status: "PAID" },
      _sum: { amount: true },
      _count: true,
    });

    console.log(`\n── ${email} ──`);
    console.log(
      `  Commissions tab "Paid out":  ${money(paidTotal)}  (${paid._count} entries)`
    );
    console.log(
      `  Payouts tab receipts:        ${money(paymentsTotal)}  (${payments.length} SliceWP payments)`
    );
    console.log(
      `  portal batch items:          ${money(itemsTotal)}  (${items.length} items)`
    );
    console.log(`  gap vs receipts:             ${money(paidTotal - paymentsTotal)}`);
    console.log(
      `  PAID with no batch:          ${money(toNumber(noBatch._sum.amount))}  (${noBatch._count} entries)`
    );
    for (const row of byType) {
      console.log(
        `    ${row.type.padEnd(10)} ${money(toNumber(row._sum.amount))}  (${row._count})`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
