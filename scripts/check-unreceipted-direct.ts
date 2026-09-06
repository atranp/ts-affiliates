import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Read-only. Finds DIRECT ledger entries marked PAID whose SliceWP commission
 * id appears on no synced payment receipt.
 *
 * Overrides are excluded deliberately: only DIRECT entries map to a SliceWP
 * commission, so team earnings having no receipt is by design and not what this
 * is looking for.
 */

const EMAIL = process.argv[2] ?? "trindalyn.mackenzie11@gmail.com";

const money = (value: number) =>
  `$${value.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;

async function main() {
  const { PrismaClient, Prisma } = await import("@prisma/client");
  const prisma = new PrismaClient({
    datasources: { db: { url: prodDatabaseUrl() } },
  });

  const toNumber = (value: unknown) =>
    value instanceof Prisma.Decimal ? value.toNumber() : Number(value ?? 0);

  const profile = await prisma.profile.findFirst({
    where: { email: { equals: EMAIL, mode: "insensitive" } },
    select: { affiliateId: true },
  });
  if (!profile?.affiliateId) throw new Error(`${EMAIL}: no affiliate linked`);

  const payments = await prisma.slicewpPayment.findMany({
    where: { affiliateId: profile.affiliateId },
    select: { commissionIds: true, dateCreated: true },
  });
  const receipted = new Set<number>();
  for (const payment of payments) {
    for (const id of payment.commissionIds) receipted.add(id);
  }

  const entries = await prisma.ledgerEntry.findMany({
    where: { affiliateId: profile.affiliateId, status: "PAID", type: "DIRECT" },
    select: {
      amount: true,
      slicewpCommissionId: true,
      wooOrderId: true,
      occurredAt: true,
      paidAt: true,
    },
    orderBy: { occurredAt: "asc" },
  });

  const missing = entries.filter(
    (e) => e.slicewpCommissionId === null || !receipted.has(e.slicewpCommissionId)
  );
  const total = missing.reduce((s, e) => s + toNumber(e.amount), 0);
  const noSlicewpId = missing.filter((e) => e.slicewpCommissionId === null);

  console.log(`${EMAIL}`);
  console.log(`  receipted SliceWP commission ids: ${receipted.size}`);
  console.log(`  DIRECT PAID entries:              ${entries.length}`);
  console.log(
    `  without a receipt:                ${missing.length}  ${money(total)}`
  );
  console.log(`    of those, no SliceWP id:        ${noSlicewpId.length}`);

  if (missing.length) {
    const dates = missing.map((e) => e.occurredAt.toISOString().slice(0, 10));
    console.log(`  date range:                       ${dates[0]} → ${dates[dates.length - 1]}`);
    console.log("\n  first 15:");
    for (const entry of missing.slice(0, 15)) {
      console.log(
        `    ${entry.occurredAt.toISOString().slice(0, 10)}  order ${String(entry.wooOrderId ?? "—").padStart(6)}  ${money(toNumber(entry.amount)).padStart(10)}  slicewpId=${entry.slicewpCommissionId ?? "none"}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
