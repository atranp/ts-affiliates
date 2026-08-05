import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

async function main() {
  const { normalizePayoutWeeks } = await import(
    "../lib/payouts/normalize-payout-weeks"
  );
  const { prisma } = await import("../lib/prisma");

  const result = await normalizePayoutWeeks();
  console.log(
    `Snapped ${result.normalized} of ${result.drifted} drifted payout weeks onto UTC midnight.`
  );
  if (result.skippedSettled > 0) {
    console.log(
      `Left ${result.skippedSettled} settled entries untouched so past payouts still reflect what was disbursed.`
    );
  }

  const buckets = await prisma.$queryRaw<
    Array<{ week: string; n: bigint; total: string }>
  >`
    SELECT to_char("payoutWeek" AT TIME ZONE 'UTC', 'YYYY-MM-DD HH24:MI Dy') AS week,
           count(*) AS n,
           sum("amount")::text AS total
    FROM "LedgerEntry"
    WHERE "status" = 'UNPAID' AND "payoutWeek" IS NOT NULL
    GROUP BY 1
    ORDER BY 1
  `;
  console.log("\nunpaid entries by payout week (UTC):");
  for (const row of buckets) {
    console.log(
      `  ${row.week}  ${row.n} entries  $${Number(row.total).toFixed(2)}`
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
