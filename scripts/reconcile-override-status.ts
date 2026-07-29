import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { reconcileMislabeledOverridePayouts } = await import(
    "../lib/ledger/reconcile-override-status"
  );
  const { prisma } = await import("../lib/prisma");

  const { corrected } = await reconcileMislabeledOverridePayouts();
  console.log(
    `Reclassified ${corrected} team bonus entries from PAID → UNPAID.`
  );
  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
