import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { backfillLedgerOccurredAt } = await import(
    "../lib/ledger/backfill-occurred-at"
  );
  const { prisma } = await import("../lib/prisma");

  const { direct, overrides, fallback } = await backfillLedgerOccurredAt();
  console.log(
    `Dated ${direct} direct commissions, ${overrides} team bonuses, and fell back to insert time for ${fallback} entries.`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
