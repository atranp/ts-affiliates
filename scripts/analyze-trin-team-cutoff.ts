import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";
import { endOfStoreWeek, startOfStoreWeek } from "../lib/payouts/store-dates";
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
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );
  const { PAID_STATUS } = await import("../lib/payouts/status");

  const now = new Date();
  const thisWeekStart = startOfStoreWeek(now);
  const lastWeekEnd = new Date(thisWeekStart.getTime() - 1);
  const lastWeekStart = startOfStoreWeek(lastWeekEnd);

  console.log("Today (PT):", formatInTimeZone(now, APP_TIMEZONE, "yyyy-MM-dd EEEE"));
  console.log("This payout week starts:", formatInTimeZone(thisWeekStart, APP_TIMEZONE, "yyyy-MM-dd"));
  console.log("Last payout week:", formatInTimeZone(lastWeekStart, APP_TIMEZONE, "yyyy-MM-dd"), "→", formatInTimeZone(lastWeekEnd, APP_TIMEZONE, "yyyy-MM-dd"));

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  if (!trin) throw new Error("Trin not found");

  const teamBatches = await prisma.payoutBatch.findMany({
    where: {
      status: PAID_STATUS,
      ledgerEntries: { some: { affiliateId: trin.id, type: "OVERRIDE" } },
    },
    orderBy: { processedAt: "desc" },
    select: {
      processedAt: true,
      createdAt: true,
      items: {
        where: { affiliateId: trin.id },
        select: { totalAmount: true, entryCount: true },
      },
    },
  });
  console.log(`\nPlatform team batches: ${teamBatches.length}`);
  for (const b of teamBatches) {
    const item = b.items[0];
    console.log(
      `  ${formatInTimeZone(b.processedAt ?? b.createdAt, APP_TIMEZONE, "yyyy-MM-dd")}  ${money(toNumber(item?.totalAmount))}  ${item?.entryCount ?? 0} rows`
    );
  }

  const options = await getPayoutOptions({ affiliateId: trin.id, cutoff: now });
  console.log(`\nPayout picker today: ${options.teams[0]?.members.length ?? 0} rows, ${money(options.teams[0]?.amount ?? 0)}`);

  for (const row of options.teams[0]?.members ?? []) {
    const paidAt = row.sublabel.match(/· ([A-Za-z]{3} \d+, \d{4})/)?.[1] ?? "?";
    console.log(`  ${row.label.padEnd(16)} ${money(row.amount).padStart(10)}  ${row.entryCount} sales  anchor ${paidAt}`);
  }

  for (const slicewpId of [81, 138, 124]) {
    const member = await prisma.affiliate.findFirst({
      where: { slicewpId },
      select: { id: true, displayName: true },
    });
    if (!member) continue;

    const anchors = await listDirectPayoutAnchorsForMember(member.id, 8);
    console.log(`\n${member.displayName} direct anchors (newest first):`);
    for (const a of anchors) {
      const inPicker = options.teams[0]?.members.some((r) =>
        r.sublabel.includes(formatInTimeZone(a.paidAt, APP_TIMEZONE, "MMM d, yyyy"))
      );
      console.log(
        `  ${formatInTimeZone(a.paidAt, APP_TIMEZONE, "yyyy-MM-dd")}  ${money(a.amount).padStart(10)}  ${String(a.entryCount).padStart(3)} comms  picker=${inPicker ? "YES" : "no"}`
      );
    }
  }

  // How much UNPAID would remain if we mark overrides paid when anchor <= last week end?
  let wouldMark = 0;
  let wouldMarkAmt = 0;
  let wouldKeep = 0;
  let wouldKeepAmt = 0;

  for (const slicewpId of [81, 138, 124]) {
    const member = await prisma.affiliate.findFirst({
      where: { slicewpId },
      select: { id: true },
    });
    if (!member) continue;
    const anchors = await listDirectPayoutAnchorsForMember(member.id, 100);
    const anchorByComm = new Map<string, Date>();
    for (const a of anchors) {
      for (const cid of a.commissionIds) {
        if (!anchorByComm.has(cid) || a.paidAt > anchorByComm.get(cid)!)
          anchorByComm.set(cid, a.paidAt);
      }
    }

    const unpaid = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trin.id,
        type: "OVERRIDE",
        status: "UNPAID",
        sourceAffiliateId: member.id,
      },
      select: { amount: true, sourceCommissionId: true },
    });

    for (const row of unpaid) {
      const anchorDate = row.sourceCommissionId
        ? anchorByComm.get(row.sourceCommissionId)
        : undefined;
      const amt = toNumber(row.amount);
      if (!anchorDate || anchorDate <= lastWeekEnd) {
        wouldMark += 1;
        wouldMarkAmt += amt;
      } else {
        wouldKeep += 1;
        wouldKeepAmt += amt;
      }
    }
  }

  console.log(`\nIf mark PAID through last week end (${formatInTimeZone(lastWeekEnd, APP_TIMEZONE, "yyyy-MM-dd")}):`);
  console.log(`  Mark PAID: ${wouldMark} rows ${money(wouldMarkAmt)}`);
  console.log(`  Keep UNPAID: ${wouldKeep} rows ${money(wouldKeepAmt)}`);

  await prisma.$disconnect();
}

main().catch(console.error);
