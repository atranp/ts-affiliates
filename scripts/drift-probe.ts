import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Proves the drift detector actually fires.
 *
 * `m3-settle-smoke` asserts drift is zero, which on its own could mean the
 * query is right or that it never matches anything. This un-pays one mirrored
 * commission behind a settled batch, checks the count moves, and puts it back.
 *
 * Usage: npx tsx scripts/drift-probe.ts
 */

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { getWriteBackHealth } = await import("../lib/payouts/reconcile");

  const entry = await prisma.ledgerEntry.findFirst({
    where: {
      type: "DIRECT",
      status: "PAID",
      payoutBatchId: { not: null },
      payoutBatch: { writeBackStatus: "SETTLED" },
    },
    select: { slicewpCommissionId: true, affiliateId: true },
  });

  if (!entry?.slicewpCommissionId) {
    throw new Error("No settled batch to probe. Run npm run m3-smoke first.");
  }

  const where = { slicewpId: entry.slicewpCommissionId };

  const before = (await getWriteBackHealth()).drifted;
  await prisma.commission.update({ where, data: { status: "UNPAID" } });
  const during = (await getWriteBackHealth()).drifted;
  await prisma.commission.update({ where, data: { status: "PAID" } });
  const after = (await getWriteBackHealth()).drifted;

  console.log(
    `drift  before=${before}  with one commission un-paid=${during}  restored=${after}`
  );

  if (before !== 0 || during !== 1 || after !== 0) {
    throw new Error("Drift detector did not respond to injected drift.");
  }

  console.log("drift detector responds correctly");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\n${error instanceof Error ? error.message : error}`);
    process.exit(1);
  });
