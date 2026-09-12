import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

import { Prisma, PrismaClient } from "@prisma/client";

const money = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const toNum = (v: unknown) =>
  v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);

async function audit(email: string) {
  const prisma = new PrismaClient({ datasources: { db: { url: prodDatabaseUrl() } } });
  const profile = await prisma.profile.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { affiliateId: true },
  });
  if (!profile?.affiliateId) throw new Error(`no profile for ${email}`);
  const affiliateId = profile.affiliateId;

  console.log(`\n${"=".repeat(70)}\n${email}  portalAffiliateId=${affiliateId}\n${"=".repeat(70)}`);

  const ledgerAll = await prisma.ledgerEntry.groupBy({
    by: ["type", "status"],
    where: { affiliateId },
    _sum: { amount: true, orderRevenue: true },
    _count: true,
  });

  console.log("\n── LedgerEntry by type/status ──");
  let ledgerUnpaid = 0;
  let directRevenue = 0;
  for (const r of ledgerAll.sort(
    (a, b) => a.type.localeCompare(b.type) || a.status.localeCompare(b.status)
  )) {
    const amt = toNum(r._sum.amount);
    const rev = toNum(r._sum.orderRevenue);
    console.log(
      `  ${r.type.padEnd(8)} ${r.status.padEnd(8)} n=${String(r._count).padStart(5)}  amount=${money(amt).padStart(12)}  orderRevenue=${money(rev).padStart(12)}`
    );
    if (r.status === "UNPAID") ledgerUnpaid += amt;
    if (r.type === "DIRECT") directRevenue += rev;
  }

  const perfEarnings = await prisma.ledgerEntry.aggregate({
    where: { affiliateId },
    _sum: { amount: true },
  });
  const perfRevenue = await prisma.ledgerEntry.aggregate({
    where: { affiliateId, type: "DIRECT" },
    _sum: { orderRevenue: true },
    _count: true,
  });

  console.log("\n── Dashboard headline numbers (all-time) ──");
  console.log(`  Earnings:              ${money(toNum(perfEarnings._sum.amount))}`);
  console.log(
    `  Sales generated ($):   ${money(toNum(perfRevenue._sum.orderRevenue))}  (${perfRevenue._count} direct rows)`
  );
  console.log(`  Ready for payout:      ${money(ledgerUnpaid)}`);

  const commAll = await prisma.commission.groupBy({
    by: ["status"],
    where: { affiliateId },
    _sum: { amount: true, orderRevenue: true },
    _count: true,
  });
  console.log("\n── Commission table (SliceWP mirror) ──");
  for (const r of commAll) {
    console.log(
      `  ${r.status.padEnd(8)} n=${String(r._count).padStart(5)}  amount=${money(toNum(r._sum.amount)).padStart(12)}  orderRevenue=${money(toNum(r._sum.orderRevenue)).padStart(12)}`
    );
  }

  const commCount = await prisma.commission.count({ where: { affiliateId } });
  const ledgerDirectCount = await prisma.ledgerEntry.count({
    where: { affiliateId, type: "DIRECT" },
  });
  const commNoLedger = await prisma.commission.count({
    where: { affiliateId, ledgerEntries: { none: {} } },
  });

  console.log("\n── Sync integrity ──");
  console.log(`  Commission rows: ${commCount}`);
  console.log(`  Ledger DIRECT rows: ${ledgerDirectCount}`);
  console.log(`  Commissions with no ledger entry: ${commNoLedger}`);

  const drift = await prisma.$queryRaw<
    { n: bigint; sum_diff: Prisma.Decimal | null }[]
  >`
    SELECT COUNT(*)::bigint AS n, SUM(ABS(c.amount - le.amount)) AS sum_diff
    FROM "Commission" c
    JOIN "LedgerEntry" le ON le."sourceCommissionId" = c.id
    WHERE c."affiliateId" = ${affiliateId} AND le."type" = 'DIRECT'
      AND c.amount <> le.amount
  `;
  console.log(
    `  Amount mismatches (comm vs ledger): ${Number(drift[0]?.n ?? 0)}  abs diff ${money(toNum(drift[0]?.sum_diff))}`
  );

  const payments = await prisma.slicewpPayment.aggregate({
    where: { affiliateId },
    _sum: { amount: true },
    _count: true,
  });
  console.log("\n── Payouts ──");
  console.log(
    `  SlicewpPayment receipts: ${money(toNum(payments._sum.amount))}  (${payments._count})`
  );

  const affiliate = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { slicewpId: true, displayName: true, syncedAt: true },
  });
  console.log("\n── Meta ──");
  console.log(
    `  ${affiliate?.displayName} slicewpId=${affiliate?.slicewpId} lastSynced=${affiliate?.syncedAt?.toISOString() ?? "null"}`
  );

  const inherit = await prisma.commission.count({
    where: { affiliateId, type: "inherit" },
  });
  console.log(`  inherit commissions (not in ledger): ${inherit}`);

  await prisma.$disconnect();
}

async function main() {
  for (const email of [
    "blair@blairswish.com",
    "trindalyn.mackenzie11@gmail.com",
    "emmiepayton1@gmail.com",
  ]) {
    await audit(email);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
