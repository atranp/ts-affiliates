import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only "is the portal presentable" snapshot: the headline figures each of
 * the four affiliates sees on login, plus the data-quality gauges that decide
 * whether a sales figure is exact or a gross-revenue fallback.
 */

const AFFILIATES = [
  { slicewpId: 51, name: "Trindalyn Mackenzie" },
  { slicewpId: 81, name: "Blair Rodgers" },
  { slicewpId: 138, name: "Emmie Payton" },
  { slicewpId: 124, name: "Dd Perez" },
];

function money(v: number) {
  return `$${v.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function pad(s: string, n: number) {
  return s.length >= n ? s : s + " ".repeat(n - s.length);
}

function padLeft(s: string, n: number) {
  return s.length >= n ? s : " ".repeat(n - s.length) + s;
}

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getAffiliatePerformance } = await import(
    "../lib/affiliate/performance"
  );
  const { resolvePeriod } = await import("../lib/affiliate/period");
  const { getLedgerResponse } = await import("../lib/ledger/queries");
  const { getTeamsForSponsor, getTeamDetail } = await import(
    "../lib/teams/queries"
  );
  const { getPayoutOptions } = await import("../lib/payouts/options");

  console.log("=".repeat(78));
  console.log("AFFILIATE PORTAL READINESS SNAPSHOT (production)");
  console.log("=".repeat(78));

  const { range, previous } = resolvePeriod({ key: "all" });

  console.log(
    `\n${pad("Affiliate", 22)}${padLeft("Commissionable sales", 21)}${padLeft("Earnings", 14)}${padLeft("Ready to pay", 14)}`
  );
  console.log("-".repeat(78));

  for (const spec of AFFILIATES) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId: spec.slicewpId },
      select: { id: true, displayName: true },
    });
    if (!affiliate) {
      console.log(`${pad(spec.name, 22)}  MISSING`);
      continue;
    }
    const perf = await getAffiliatePerformance(affiliate.id, range, previous);
    const ledger = await getLedgerResponse({
      affiliateId: affiliate.id,
      limit: 1,
    });
    console.log(
      pad(affiliate.displayName ?? spec.name, 22) +
        padLeft(money(perf.current.revenue), 21) +
        padLeft(money(perf.current.earnings), 14) +
        padLeft(money(ledger.accountSummary.unpaidTotal), 14)
    );
  }

  // ── Trin's team view ─────────────────────────────────────────────────────

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });

  if (trin) {
    const team = (await getTeamsForSponsor(trin.id))[0];
    console.log(`\n${"-".repeat(78)}\nTRIN TEAM TAB\n${"-".repeat(78)}`);
    if (team) {
      const detail = await getTeamDetail(team.id);
      console.log(
        `Team commissionable sales : ${money(team.stats.totalRevenue)}`
      );
      console.log(`Members                   : ${detail?.members.length ?? 0}`);
      for (const m of detail?.members ?? []) {
        console.log(
          `  ${pad(m.displayName ?? "—", 20)} sales ${padLeft(money(m.stats.totalRevenue), 14)}   unpaid team cut ${padLeft(money(m.stats.unpaidTeamBonus), 12)}`
        );
      }
    }

    const options = await getPayoutOptions({
      affiliateId: trin.id,
      cutoff: new Date(),
    });
    const teamOpt = options.teams[0];
    console.log(`\n${"-".repeat(78)}\nPAYOUT PICKER\n${"-".repeat(78)}`);
    console.log(
      `Rows ${teamOpt?.members.length ?? 0}   total ${money(teamOpt?.amount ?? 0)}`
    );

    const overrideTotals = await prisma.ledgerEntry.groupBy({
      by: ["status"],
      where: { affiliateId: trin.id, type: "OVERRIDE" },
      _sum: { amount: true },
      _count: true,
    });
    console.log("\nTrin override ledger:");
    for (const row of overrideTotals) {
      console.log(
        `  ${pad(row.status, 10)} ${padLeft(String(row._count), 6)} rows ${padLeft(money(toNumber(row._sum.amount)), 14)}`
      );
    }

    const rule = await prisma.dealRule.findFirst({
      where: { sponsorAffiliateId: trin.id, active: true, teamId: { not: null } },
      select: { type: true, ratePercent: true, basis: true, schedule: true },
    });
    console.log(
      `\nActive team rule: ${rule?.type} @ ${rule ? toNumber(rule.ratePercent) : "?"}% basis ${rule?.basis} schedule ${JSON.stringify(rule?.schedule)}`
    );

    // Members with sales but no unpaid team cut: either fully paid out or a gap.
    const team2 = (await getTeamsForSponsor(trin.id))[0];
    const detail2 = team2 ? await getTeamDetail(team2.id) : null;
    const suspicious = (detail2?.members ?? []).filter(
      (m) => m.stats.totalRevenue > 0 && m.stats.unpaidTeamBonus === 0
    );
    if (suspicious.length) {
      console.log(
        `\n${"-".repeat(78)}\nMEMBERS WITH SALES BUT NO UNPAID TEAM CUT\n${"-".repeat(78)}`
      );
      for (const m of suspicious) {
        const rows = await prisma.ledgerEntry.groupBy({
          by: ["status"],
          where: {
            affiliateId: trin.id,
            type: "OVERRIDE",
            sourceAffiliateId: m.id,
          },
          _sum: { amount: true },
          _count: true,
        });
        const summary = rows.length
          ? rows
              .map(
                (r) =>
                  `${r.status} ${r._count}×${money(toNumber(r._sum.amount))}`
              )
              .join(", ")
          : "NO OVERRIDE ROWS AT ALL";
        console.log(
          `  ${pad(m.displayName ?? "—", 20)} sales ${padLeft(money(m.stats.totalRevenue), 12)}  →  ${summary}`
        );
      }
    }
  }

  // ── Data quality: how many sales figures are exact vs gross fallback ─────

  const [coverage] = await prisma.$queryRaw<
    [{ total: bigint; withbase: bigint }]
  >`
    SELECT COUNT(*)::bigint AS total,
           COUNT("commissionBase")::bigint AS withbase
    FROM "Commission"
  `;
  const total = Number(coverage?.total ?? 0);
  const withBase = Number(coverage?.withbase ?? 0);
  console.log(`\n${"-".repeat(78)}\nDATA QUALITY\n${"-".repeat(78)}`);
  console.log(
    `Commissions with exact commissionable base: ${withBase}/${total} (${((withBase / (total || 1)) * 100).toFixed(1)}%)`
  );
  console.log(
    `Remaining rows fall back to gross order revenue (slightly overstates sales).`
  );

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  process.exitCode = 1;
});
