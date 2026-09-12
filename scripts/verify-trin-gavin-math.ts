import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only: does the portal now reproduce Gavin's spreadsheet, where a
 * sponsor's team cut on a pool of recruit commission is that pool ÷ 3?
 */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) => `$${v.toFixed(2)}`;

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const rows = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId"],
    where: {
      affiliateId: trin.id,
      type: "OVERRIDE",
      status: "UNPAID",
      sourceAffiliateId: { not: null },
    },
    _sum: { amount: true },
    _count: true,
  });

  console.log("=== Trin UNPAID team cut vs recruit commission ÷ 3 ===\n");

  let totalOverride = 0;
  let totalExpected = 0;

  for (const row of rows.sort(
    (a, b) => n(b._sum.amount) - n(a._sum.amount)
  )) {
    const memberId = row.sourceAffiliateId!;
    const member = await prisma.affiliate.findUnique({
      where: { id: memberId },
      select: { displayName: true, slicewpId: true },
    });

    // The direct commissions those override rows were generated from.
    const linked = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trin.id,
        type: "OVERRIDE",
        status: "UNPAID",
        sourceAffiliateId: memberId,
      },
      select: { sourceCommission: { select: { amount: true } } },
    });

    const commissionPool = linked.reduce(
      (sum, entry) => sum + n(entry.sourceCommission?.amount),
      0
    );
    const override = n(row._sum.amount);
    const expected = commissionPool / 3;

    totalOverride += override;
    totalExpected += expected;

    console.log(
      `  #${member?.slicewpId} ${(member?.displayName ?? "?").padEnd(22)} ` +
        `commission ${m(commissionPool).padStart(12)}  ÷3 = ${m(expected).padStart(11)}  ` +
        `portal ${m(override).padStart(11)}  diff ${m(override - expected)}  (${row._count} rows)`
    );
  }

  console.log(
    `\n  TOTAL  ÷3 = ${m(totalExpected)}   portal = ${m(totalOverride)}   diff ${m(totalOverride - totalExpected)}`
  );
  console.log(
    "\n  (Any diff is per-row rounding to cents, which is how the ledger stores money.)"
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    const { prisma } = await import("../lib/prisma");
    await prisma.$disconnect();
  });
