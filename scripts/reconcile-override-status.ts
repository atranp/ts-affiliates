import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { reconcileMislabeledOverridePayouts } from "../lib/ledger/reconcile-override-status";
import { prisma } from "../lib/prisma";

async function main() {
  const { corrected } = await reconcileMislabeledOverridePayouts();
  console.log(`Reclassified ${corrected} team bonus entries from PAID → UNPAID.`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
