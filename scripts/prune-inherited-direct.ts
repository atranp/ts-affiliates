import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { pruneInheritedDirectEntries } = await import(
    "../lib/ledger/prune-inherited-direct"
  );
  const { prisma } = await import("../lib/prisma");

  const result = await pruneInheritedDirectEntries();
  console.log(
    `Removed ${result.removed} duplicate tier-2 ledger lines worth $${result.removedAmount.toFixed(2)}.`
  );
  console.log(
    `Kept ${result.keptSettled} settled lines worth $${result.keptSettledAmount.toFixed(2)} so past payout batches still reconcile.`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
