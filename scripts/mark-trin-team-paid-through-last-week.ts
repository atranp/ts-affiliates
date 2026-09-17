/**
 * Mark Trin's UNPAID team overrides as PAID when the recruit's direct payout
 * landed on or before the end of last store payout week.
 *
 * Historical team cuts were settled outside the portal; this clears the backlog
 * so only the current round (recruit direct payouts after last Monday) stays UNPAID.
 *
 *   npx tsx scripts/mark-trin-team-paid-through-last-week.ts          # dry run
 *   npx tsx scripts/mark-trin-team-paid-through-last-week.ts --apply   # write prod
 */
import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { config } from "dotenv";
import { formatInTimeZone } from "date-fns-tz";
import { prodDatabaseUrl } from "./prod-env";
import {
  endOfStoreWeek,
  startOfStoreWeek,
} from "../lib/payouts/store-dates";
import { APP_TIMEZONE } from "../lib/timezone";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();
// Prisma-dependent modules must load after DATABASE_URL is set (see prod-env).

const RECRUIT_SLICEWP_IDS = [81, 138, 124];

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

/** End of the store payout week before the one `now` falls in. */
function endOfLastPayoutWeek(now = new Date()): Date {
  const thisWeekStart = startOfStoreWeek(now);
  const lastWeekDay = new Date(thisWeekStart.getTime() - 24 * 60 * 60 * 1000);
  return endOfStoreWeek(lastWeekDay);
}

async function main() {
  const apply = process.argv.includes("--apply");
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );

  const cutoff = endOfLastPayoutWeek();
  console.log(
    `Cutoff: recruit direct payout on or before ${formatInTimeZone(cutoff, APP_TIMEZONE, "yyyy-MM-dd EEEE")} (PT end of day)`
  );
  console.log(`Mode: ${apply ? "APPLY" : "dry run"}\n`);

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true, displayName: true },
  });
  if (!trin) throw new Error("Trin not found");

  const toMark: Array<{ id: string; amount: number; paidAt: Date; member: string }> =
    [];

  for (const slicewpId of RECRUIT_SLICEWP_IDS) {
    const member = await prisma.affiliate.findFirst({
      where: { slicewpId },
      select: { id: true, displayName: true },
    });
    if (!member) continue;

    const anchors = await listDirectPayoutAnchorsForMember(member.id, 100);
    const anchorByComm = new Map<string, Date>();
    for (const anchor of anchors) {
      for (const cid of anchor.commissionIds) {
        const prev = anchorByComm.get(cid);
        if (!prev || anchor.paidAt > prev) {
          anchorByComm.set(cid, anchor.paidAt);
        }
      }
    }

    const unpaid = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trin.id,
        type: LedgerEntryType.OVERRIDE,
        status: CommissionStatus.UNPAID,
        sourceAffiliateId: member.id,
      },
      select: { id: true, amount: true, sourceCommissionId: true },
    });

    for (const row of unpaid) {
      if (!row.sourceCommissionId) continue;
      const anchorDate = anchorByComm.get(row.sourceCommissionId);
      if (!anchorDate || anchorDate > cutoff) continue;
      toMark.push({
        id: row.id,
        amount: toNumber(row.amount),
        paidAt: anchorDate,
        member: member.displayName ?? `#${slicewpId}`,
      });
    }
  }

  const total = toMark.reduce((s, r) => s + r.amount, 0);
  const byMember = new Map<string, { count: number; amount: number }>();
  for (const row of toMark) {
    const cur = byMember.get(row.member) ?? { count: 0, amount: 0 };
    cur.count += 1;
    cur.amount += row.amount;
    byMember.set(row.member, cur);
  }

  console.log(`Would mark PAID: ${toMark.length} rows  ${money(total)}`);
  for (const [member, stats] of Array.from(byMember.entries())) {
    console.log(`  ${member}: ${stats.count} rows  ${money(stats.amount)}`);
  }

  if (!apply) {
    const after = await getPayoutOptions({
      affiliateId: trin.id,
      cutoff: new Date(),
    });
    console.log(
      `\nPayout picker today (before): ${after.teams[0]?.members.length ?? 0} rows  ${money(after.teams[0]?.amount ?? 0)}`
    );
    console.log(
      `Would remain UNPAID: ${money((after.teams[0]?.amount ?? 0) - total)} (approx, current round only)`
    );
    console.log("\nRe-run with --apply to write.");
    await prisma.$disconnect();
    return;
  }

  const byPaidAt = new Map<string, string[]>();
  for (const row of toMark) {
    const key = row.paidAt.toISOString();
    const ids = byPaidAt.get(key) ?? [];
    ids.push(row.id);
    byPaidAt.set(key, ids);
  }

  let updated = 0;
  for (const [paidAtIso, ids] of Array.from(byPaidAt.entries())) {
    const result = await prisma.ledgerEntry.updateMany({
      where: { id: { in: ids }, status: CommissionStatus.UNPAID },
      data: { status: CommissionStatus.PAID, paidAt: new Date(paidAtIso) },
    });
    updated += result.count;
  }

  console.log(`\nUpdated ${updated} ledger entries to PAID.`);

  const after = await getPayoutOptions({
    affiliateId: trin.id,
    cutoff: new Date(),
  });
  console.log(
    `Payout picker now: ${after.teams[0]?.members.length ?? 0} rows  ${money(after.teams[0]?.amount ?? 0)}`
  );
  for (const row of after.teams[0]?.members ?? []) {
    console.log(`  · ${row.label}  ${money(row.amount)}  ${row.sublabel}`);
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
