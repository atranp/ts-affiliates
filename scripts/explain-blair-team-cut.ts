import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";
import { formatInTimeZone } from "date-fns-tz";
import { APP_TIMEZONE } from "../lib/timezone";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getTeamsForSponsor, getTeamDetail } = await import("../lib/teams/queries");
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { listDirectPayoutAnchorsForMember, coveredSourceCommissionIds } =
    await import("../lib/payouts/direct-payout-ref");

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  const blair = await prisma.affiliate.findFirst({
    where: { slicewpId: 81 },
    select: { id: true, displayName: true },
  });
  if (!trin || !blair) throw new Error("Missing affiliate");

  const team = (await getTeamsForSponsor(trin.id))[0];
  const detail = team ? await getTeamDetail(team.id) : null;
  const member = detail?.members.find((m) => m.id === blair.id);

  console.log("=".repeat(72));
  console.log("BLAIR UNPAID TEAM CUT — TRIN");
  console.log("=".repeat(72));
  console.log(`\nTeam roster "unpaid team cut": ${money(member?.stats.unpaidTeamBonus ?? 0)}`);

  const unpaid = await prisma.ledgerEntry.groupBy({
    by: ["status"],
    where: {
      affiliateId: trin.id,
      type: "OVERRIDE",
      sourceAffiliateId: blair.id,
      status: { in: ["UNPAID", "PENDING"] },
    },
    _sum: { amount: true },
    _count: true,
  });
  console.log("\nOverride ledger (Blair → Trin):");
  for (const row of unpaid) {
    console.log(`  ${row.status.padEnd(8)} ${String(row._count).padStart(5)} rows  ${money(toNumber(row._sum.amount))}`);
  }

  const unpaidOnly = await prisma.ledgerEntry.findMany({
    where: {
      affiliateId: trin.id,
      type: "OVERRIDE",
      sourceAffiliateId: blair.id,
      status: "UNPAID",
    },
    select: {
      amount: true,
      sourceCommissionId: true,
      occurredAt: true,
      sourceCommission: {
        select: {
          status: true,
          slicewpId: true,
          amount: true,
        },
      },
    },
  });

  const covered = await coveredSourceCommissionIds(blair.id);
  const anchors = await listDirectPayoutAnchorsForMember(blair.id, 5);
  const anchorByComm = new Map<string, { paidAt: Date; amount: number }>();
  for (const a of anchors) {
    for (const cid of a.commissionIds) {
      anchorByComm.set(cid, { paidAt: a.paidAt, amount: a.amount });
    }
  }

  type Bucket = { count: number; amount: number };
  const buckets: Record<string, Bucket> = {
    "In payout picker (Sep 8 direct paid)": { count: 0, amount: 0 },
    "Awaiting Blair direct payout (recruit not paid yet)": { count: 0, amount: 0 },
    "No source commission link": { count: 0, amount: 0 },
    "Other UNPAID": { count: 0, amount: 0 },
  };

  for (const row of unpaidOnly) {
    const amt = toNumber(row.amount);
    if (!row.sourceCommissionId) {
      buckets["No source commission link"].count += 1;
      buckets["No source commission link"].amount += amt;
      continue;
    }
    const anchor = anchorByComm.get(row.sourceCommissionId);
    if (anchor) {
      buckets["In payout picker (Sep 8 direct paid)"].count += 1;
      buckets["In payout picker (Sep 8 direct paid)"].amount += amt;
      continue;
    }
    if (!covered.has(row.sourceCommissionId)) {
      buckets["Awaiting Blair direct payout (recruit not paid yet)"].count += 1;
      buckets["Awaiting Blair direct payout (recruit not paid yet)"].amount += amt;
      continue;
    }
    buckets["Other UNPAID"].count += 1;
    buckets["Other UNPAID"].amount += amt;
  }

  console.log("\nUNPAID breakdown:");
  for (const [label, b] of Object.entries(buckets)) {
    if (b.count === 0) continue;
    console.log(`  ${label}`);
    console.log(`    ${b.count} rows  ${money(b.amount)}`);
  }

  const pending = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: "OVERRIDE",
      sourceAffiliateId: blair.id,
      status: "PENDING",
    },
    _sum: { amount: true },
    _count: true,
  });
  if (pending._count) {
    console.log(`\nPENDING (Blair commission not paid in SliceWP yet):`);
    console.log(`  ${pending._count} rows  ${money(toNumber(pending._sum.amount))}`);
    console.log("  Not in roster unpaid team cut — roster sums UNPAID only.");
  }

  const options = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff: new Date(),
  });
  const blairPicker = options.teams[0]?.members.filter((m) =>
    m.label.includes("Blair")
  );
  console.log("\nPayout picker Blair row(s):");
  for (const row of blairPicker ?? []) {
    console.log(`  ${money(row.amount)}  ${row.sublabel}`);
  }
  console.log(`  awaitingDirectPayout total: ${money(options.awaitingDirectPayout.amount)} (${options.awaitingDirectPayout.entryCount} rows all members)`);

  // Sample recent awaiting-direct rows
  const awaiting = unpaidOnly.filter(
    (row) =>
      row.sourceCommissionId &&
      !anchorByComm.has(row.sourceCommissionId) &&
      !covered.has(row.sourceCommissionId)
  );
  if (awaiting.length) {
    console.log(`\nSample sales waiting on Blair's next direct payout (${awaiting.length} total):`);
    const sorted = [...awaiting].sort(
      (a, b) => b.occurredAt.getTime() - a.occurredAt.getTime()
    );
    for (const row of sorted.slice(0, 5)) {
      console.log(
        `  ${formatInTimeZone(row.occurredAt, APP_TIMEZONE, "yyyy-MM-dd")}  team cut ${money(toNumber(row.amount))}  Blair comm ${money(toNumber(row.sourceCommission?.amount))}  slicewp #${row.sourceCommission?.slicewpId}  status ${row.sourceCommission?.status}`
      );
    }
  }

  await prisma.$disconnect();
}

main().catch(console.error);
