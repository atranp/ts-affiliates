import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Local entry point for the commissionable-base backfill.
 *
 * Shares its logic with `POST /api/admin/backfill-order-totals`, which is the
 * route to use against production — the production store credentials only exist
 * in Vercel's environment, and this will refuse to run rather than source order
 * figures from the Local WP copy.
 *
 *   npx tsx scripts/backfill-order-totals.ts                    # dry run
 *   npx tsx scripts/backfill-order-totals.ts --apply
 *   npx tsx scripts/backfill-order-totals.ts --apply --affiliate=81
 */

function flag(name: string): string | null {
  const hit = process.argv.slice(2).find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : null;
}

async function main() {
  const apply = process.argv.includes("--apply");

  if (!process.env.DATABASE_URL?.includes("localhost")) {
    process.env.DATABASE_URL = prodDatabaseUrl();
  }

  const { backfillOrderTotals } = await import("../lib/backfill/order-totals");
  const money = (v: number) => `$${v.toFixed(2)}`;

  console.log(`Mode: ${apply ? "APPLY (writes Supabase)" : "DRY RUN"}`);

  const result = await backfillOrderTotals({
    apply,
    limit: flag("limit") ? Number(flag("limit")) : null,
    affiliateSlicewpId: flag("affiliate") ? Number(flag("affiliate")) : null,
    concurrency: Number(flag("concurrency") ?? "2"),
    onProgress: (done, total) => {
      process.stdout.write(
        `\r  fetched ${done}/${total} batches (${((done / total) * 100).toFixed(0)}%)`
      );
    },
  });
  if (result.requests > 0) process.stdout.write("\n");

  console.log(
    `\n${result.pendingSales} sales need totals across ${result.orders} orders ` +
      `(${result.requests} store requests)`
  );

  if (result.orders === 0) return;

  console.log(
    `got totals for ${result.fetched}/${result.orders} orders` +
      (result.missing ? `; ${result.missing} not returned by the store` : "")
  );
  console.log(
    `  ${result.withShipping} have shipping, ${result.withTax} have tax; ` +
      `gross ${money(result.grossTotal)} → net ${money(result.netTotal)}` +
      (result.netShareOfGross
        ? ` (${(result.netShareOfGross * 100).toFixed(2)}% of gross)`
        : "")
  );

  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
    return;
  }

  console.log(
    `\nwrote ${result.ordersWritten} orders; ` +
      `${result.basesComputed} commission bases computed, ` +
      `${result.ledgerLinesMirrored} ledger lines mirrored`
  );
  console.log(`sales still without a base: ${result.salesStillWithoutBase}`);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
