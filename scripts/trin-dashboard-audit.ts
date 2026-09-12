import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only audit of what Trindalyn (#51) would see on the affiliate dashboard.
 * Usage: npx tsx scripts/trin-dashboard-audit.ts
 */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { getTeamsForSponsor, getTeamDetail } = await import("../lib/teams/queries");
  const { getLedgerResponse } = await import("../lib/ledger/queries");
  const { listPayoutHistoryForAffiliate } = await import("../lib/payouts/history");
  const { countableRevenueWhere } = await import("../lib/revenue");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) =>
    "$" +
    v.toLocaleString("en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: {
      id: true,
      slicewpId: true,
      displayName: true,
      email: true,
      status: true,
    },
  });
  if (!trin) throw new Error("Trin not found");

  console.log("=".repeat(72));
  console.log(
    "TRIN DASHBOARD AUDIT — " + (trin.displayName ?? trin.email) + " (#51)"
  );
  console.log("=".repeat(72));

  const ledger = await getLedgerResponse({ affiliateId: trin.id, limit: 3 });
  const acct = ledger.accountSummary;
  const ovr = ledger.overrideSummary;

  console.log("\n--- OVERVIEW: READY FOR PAYOUT ---");
  console.log("accountSummary.unpaidTotal: " + m(acct.unpaidTotal));
  console.log(
    "overrideAccountSummary.unpaid (team cut only): " +
      m(ledger.overrideAccountSummary.unpaidTotal)
  );
  const directUnpaid = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trin.id, type: "DIRECT", status: "UNPAID" },
    _sum: { amount: true },
  });
  console.log("DIRECT unpaid (own sales):     " + m(n(directUnpaid._sum.amount)));

  const perfDirect = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: "DIRECT",
      status: { in: ["UNPAID", "PAID"] },
      occurredAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    _sum: { amount: true },
    _count: true,
  });
  const perfOverride = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trin.id,
      type: "OVERRIDE",
      status: { in: ["UNPAID", "PAID"] },
      occurredAt: { gte: new Date(Date.now() - 30 * 86400000) },
    },
    _sum: { amount: true },
    _count: true,
  });
  console.log("\n--- OVERVIEW: LAST 30 DAYS (approx) ---");
  console.log(
    "Direct earnings: " +
      m(n(perfDirect._sum.amount)) +
      " (" +
      perfDirect._count +
      " entries)"
  );
  console.log(
    "Team cut earnings: " +
      m(n(perfOverride._sum.amount)) +
      " (" +
      perfOverride._count +
      " entries)"
  );

  const teams = await getTeamsForSponsor(trin.id);
  console.log("\n--- TEAMS HOME PREVIEW ---");
  console.log("Teams: " + teams.length);

  for (const t of teams) {
    console.log("\n  " + t.name + " (" + t.memberCount + " members)");
    console.log("  Team sales (sum):     " + m(t.stats.totalRevenue));
    console.log("  Your team cut ready:  " + m(t.stats.unpaidTeamBonus));
    console.log("  Locked until goal:    " + m(t.stats.pendingTeamBonus));
    console.log("  Team cut paid:        " + m(t.stats.paidTeamBonus));

    const detail = await getTeamDetail(t.id);
    const members = detail?.members ?? [];

    const preview = members
      .filter(
        (mem) =>
          mem.stats.totalRevenue > 0 || mem.stats.unpaidTeamBonus > 0
      )
      .sort((a, b) => b.stats.totalRevenue - a.stats.totalRevenue)
      .slice(0, 5);

    console.log("\n  Home preview shows (top 5 by sales):");
    for (const mem of preview) {
      const ms = mem.stats.milestone;
      console.log(
        "    " +
          (mem.displayName ?? mem.email).slice(0, 22).padEnd(24) +
          " sales=" +
          m(mem.stats.totalRevenue).padStart(14) +
          "  cut=" +
          m(mem.stats.unpaidTeamBonus).padStart(10) +
          "  locked=" +
          m(mem.stats.pendingTeamBonus).padStart(10) +
          "  " +
          (ms?.met ? "Goal reached" : ms ? "ramping" : "no goal") +
          (mem.stats.unpaidTeamBonus > 0 ? " [tap→ledger]" : "")
      );
    }

    const hiddenWithCut = members.filter(
      (mem) =>
        mem.stats.unpaidTeamBonus > 0 &&
        !preview.some((p) => p.id === mem.id)
    );
    if (hiddenWithCut.length > 0) {
      console.log("\n  ⚠ Members with team cut NOT on home preview:");
      for (const mem of hiddenWithCut) {
        console.log(
          "    " +
            (mem.displayName ?? mem.email) +
            " cut=" +
            m(mem.stats.unpaidTeamBonus) +
            " sales=" +
            m(mem.stats.totalRevenue)
        );
      }
    } else {
      console.log("\n  All members with unlocked team cut appear in home preview: YES");
    }

    const sumMemberUnpaid = members.reduce(
      (s, mem) => s + mem.stats.unpaidTeamBonus,
      0
    );
    console.log("\n  Reconcile unpaid team cut:");
    console.log("    Σ member cuts:  " + m(sumMemberUnpaid));
    console.log("    team aggregate: " + m(t.stats.unpaidTeamBonus));
    console.log("    overrideSummary:" + m(ovr.unpaidTotal));
    console.log(
      "    " +
        (Math.abs(sumMemberUnpaid - ovr.unpaidTotal) < 0.02
          ? "✓ reconciles"
          : "✗ MISMATCH")
    );
  }

  const payouts = await listPayoutHistoryForAffiliate(trin.id, 50);
  console.log("\n--- PAYOUTS TAB ---");
  console.log("Receipts: " + payouts.length + " (platform + SliceWP merged)");
  const paidSum = payouts.reduce(
    (sum, payout) => sum + payout.totalAmount,
    0
  );
  console.log("Sum of receipt amounts: " + m(paidSum));
  console.log("\n  Recent 5:");
  for (const p of payouts.slice(0, 5)) {
    console.log(
      "    " +
        p.label.slice(0, 38).padEnd(40) +
        m(p.totalAmount).padStart(12) +
        "  " +
        p.source +
        "  " +
        (p.processedAt ?? p.createdAt).slice(0, 10)
    );
  }

  const ledgerPaid = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trin.id, status: "PAID" },
    _sum: { amount: true },
  });
  const directPaid = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trin.id, status: "PAID", type: "DIRECT" },
    _sum: { amount: true },
  });
  const overridePaid = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trin.id, status: "PAID", type: "OVERRIDE" },
    _sum: { amount: true },
  });

  console.log("\n--- PAID RECONCILIATION ---");
  console.log("Ledger PAID (all types): " + m(n(ledgerPaid._sum.amount)));
  console.log("  DIRECT paid:           " + m(n(directPaid._sum.amount)));
  console.log("  OVERRIDE paid:         " + m(n(overridePaid._sum.amount)));
  console.log("Payout receipts sum:     " + m(paidSum));
  console.log("accountSummary.paidTotal:" + m(acct.paidTotal));
  console.log(
    "Gap (ledger paid − receipts): " + m(n(ledgerPaid._sum.amount) - paidSum)
  );

  const ownAll = await prisma.commission.aggregate({
    where: { affiliateId: trin.id, ...countableRevenueWhere },
    _sum: { orderRevenue: true, amount: true },
    _count: true,
  });
  console.log("\n--- TRIN'S OWN SALES (separate from team) ---");
  console.log(
    "All-time sales: " +
      m(n(ownAll._sum.orderRevenue)) +
      " (" +
      ownAll._count +
      " commissions)"
  );
  console.log("Direct commission earned: " + m(n(ownAll._sum.amount)));

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
