import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Aligns team bonus status with the recruit's SliceWP commission.
 * Reports without writing unless --apply is passed.
 *
 *   npm run reconcile-overrides
 *   npm run reconcile-overrides -- --apply
 */
async function main() {
  const apply = process.argv.includes("--apply");

  const { reconcileOverrideStatusToSource } = await import(
    "../lib/ledger/reconcile-override-status"
  );
  const { prisma } = await import("../lib/prisma");

  const result = await reconcileOverrideStatusToSource({ dryRun: !apply });

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  console.log(`${apply ? "Applied" : "Dry run"} — scanned ${result.scanned} team bonuses.`);
  console.log(
    `  ${result.skippedLocked} settled by our own payout batches (left alone).`
  );
  if (result.skippedNoSource > 0) {
    console.log(
      `  ${result.skippedNoSource} have no linked SliceWP commission (left alone).`
    );
  }

  if (result.transitions.length === 0) {
    console.log("  Everything already matches SliceWP.");
  } else {
    for (const transition of result.transitions) {
      console.log(
        `  ${transition.from} → ${transition.to}: ${transition.count} entries, ${money(transition.amount)}`
      );
    }
    if (!apply) {
      console.log("\nRe-run with --apply to write these changes.");
    }
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
