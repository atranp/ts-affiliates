import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Read-only. Breaks down the amount shown on a member row in the new payout
 * picker, so the figure can be traced back to individual sales.
 *
 *   npx tsx scripts/explain-member-payout.ts "Blair Rodgers"
 */
async function main() {
  const search = process.argv[2] ?? "Blair";

  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/utils");

  const money = (n: number) =>
    n.toLocaleString("en-US", { style: "currency", currency: "USD" });

  const matches = await prisma.affiliate.findMany({
    where: {
      OR: [
        { displayName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ],
    },
    select: { id: true, displayName: true, email: true, slicewpId: true },
  });

  if (matches.length === 0) {
    console.log(`No affiliate matching "${search}".`);
    return;
  }

  for (const member of matches) {
    const name = member.displayName ?? member.email;
    console.log(`\n=== ${name} (${member.email}, SliceWP #${member.slicewpId})`);

    const entries = await prisma.ledgerEntry.findMany({
      where: {
        sourceAffiliateId: member.id,
        status: "UNPAID",
        type: "OVERRIDE",
      },
      select: {
        id: true,
        amount: true,
        orderRevenue: true,
        occurredAt: true,
        wooOrderId: true,
        affiliate: { select: { id: true, displayName: true, email: true } },
        dealRule: {
          select: {
            name: true,
            ratePercent: true,
            basis: true,
            team: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { occurredAt: "asc" },
    });

    if (entries.length === 0) {
      console.log("  No unpaid OVERRIDE entries sourced from this affiliate.");
      continue;
    }

    // Same grouping the picker uses: one row per (sponsor, team, member).
    const groups = new Map<
      string,
      {
        sponsor: string;
        team: string;
        rule: string;
        total: number;
        revenue: number;
        count: number;
        first: Date;
        last: Date;
        noTeam: boolean;
      }
    >();

    for (const entry of entries) {
      const team = entry.dealRule?.team;
      const key = `${entry.affiliate.id}:${team?.id ?? "none"}`;
      const amount = toNumber(entry.amount);
      const revenue = toNumber(entry.orderRevenue);

      const group = groups.get(key) ?? {
        sponsor: entry.affiliate.displayName ?? entry.affiliate.email,
        team: team?.name ?? "(no team — not payable in the new picker)",
        rule: entry.dealRule
          ? `${entry.dealRule.name} @ ${toNumber(entry.dealRule.ratePercent)}% of ${entry.dealRule.basis}`
          : "(no deal rule)",
        total: 0,
        revenue: 0,
        count: 0,
        first: entry.occurredAt,
        last: entry.occurredAt,
        noTeam: !team,
      };

      group.total += amount;
      group.revenue += revenue;
      group.count += 1;
      if (entry.occurredAt < group.first) group.first = entry.occurredAt;
      if (entry.occurredAt > group.last) group.last = entry.occurredAt;
      groups.set(key, group);
    }

    for (const group of Array.from(groups.values())) {
      console.log(`\n  Paid to:   ${group.sponsor}`);
      console.log(`  Team:      ${group.team}`);
      console.log(`  Rule:      ${group.rule}`);
      console.log(`  Sales:     ${group.count}`);
      console.log(`  Revenue:   ${money(group.revenue)}`);
      console.log(`  OVERRIDE:  ${money(group.total)}   <-- the picker amount`);
      console.log(
        `  Effective: ${group.revenue > 0 ? ((group.total / group.revenue) * 100).toFixed(2) : "n/a"}% of sale value`
      );
      console.log(
        `  Range:     ${group.first.toISOString().slice(0, 10)} to ${group.last.toISOString().slice(0, 10)}`
      );
      if (group.noTeam) {
        console.log(
          "  NOTE:      no team on the deal rule, so this money has no member row."
        );
      }
    }

    // What Blair earns on their own sales is a different pot entirely.
    const own = await prisma.ledgerEntry.aggregate({
      where: { affiliateId: member.id, status: "UNPAID", type: "DIRECT" },
      _sum: { amount: true },
      _count: { _all: true },
    });
    console.log(
      `\n  For contrast — ${name}'s OWN unpaid direct commissions: ${money(toNumber(own._sum.amount))} across ${own._count._all} sales.`
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
