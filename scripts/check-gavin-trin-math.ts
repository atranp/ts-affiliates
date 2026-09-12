import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/** Compare Gavin's weekly team-earnings spreadsheet to portal override math. */

async function main() {
  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");

  const n = (v: unknown) =>
    v instanceof Prisma.Decimal ? v.toNumber() : Number(v ?? 0);
  const m = (v: number) => `$${v.toFixed(2)}`;

  const gavin = {
    blair: { commission: 7405.48, revenue: 24684.93 },
    emmie: { commission: 1944.93, revenue: 6483.1 },
    trinTeamCut: 3116.8,
    trinDirect: 4235.91,
    total: 7352.71,
  };

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });
  if (!trin) throw new Error("Trin not found");
  // Narrowing does not survive into the nested helpers below.
  const trinId = trin.id;

  const blair = await prisma.affiliate.findFirst({
    where: { slicewpId: 81 },
    select: { id: true },
  });
  const emmie = await prisma.affiliate.findFirst({
    where: { slicewpId: 138 },
    select: { id: true },
  });

  const rule = await prisma.dealRule.findFirst({
    where: { active: true, sponsorAffiliateId: trinId },
    select: {
      name: true,
      ratePercent: true,
      basis: true,
      milestoneRevenueThreshold: true,
    },
  });

  console.log("=== PORTAL RULE ===");
  console.log(rule);
  console.log(
    "\nPlatform formula (ORDER_REVENUE): override = orderRevenue × rate, per sale, rounded to cents"
  );
  console.log(
    "Platform formula (RECRUIT_COMMISSION): override = recruit commission × rate\n"
  );

  async function memberBlock(
    label: string,
    affiliateId: string,
    gavinRow: { commission: number; revenue: number }
  ) {
    const directUnpaid = await prisma.ledgerEntry.aggregate({
      where: { affiliateId, type: "DIRECT", status: "UNPAID" },
      _sum: { amount: true, orderRevenue: true },
      _count: true,
    });
    const overrideUnpaid = await prisma.ledgerEntry.aggregate({
      where: {
        affiliateId: trinId,
        type: "OVERRIDE",
        sourceAffiliateId: affiliateId,
        status: "UNPAID",
      },
      _sum: { amount: true, orderRevenue: true },
      _count: true,
    });

    const portalComm = n(directUnpaid._sum.amount);
    const portalSales = n(directUnpaid._sum.orderRevenue);
    const portalOverride = n(overrideUnpaid._sum.amount);
    const portalOverrideSales = n(overrideUnpaid._sum.orderRevenue);
    const rate = rule ? n(rule.ratePercent) / 100 : 0.1;

    console.log(`=== ${label} — Gavin vs portal (all UNPAID right now) ===`);
    console.log(
      `  Gavin commission:  ${m(gavinRow.commission)}  →  revenue @30%: ${m(gavinRow.revenue)}`
    );
    console.log(
      `  Portal DIRECT unpaid: ${m(portalComm)} on ${m(portalSales)} sales (${directUnpaid._count} rows)`
    );
    console.log(
      `  Portal Trin OVERRIDE: ${m(portalOverride)} on ${m(portalOverrideSales)} sales (${overrideUnpaid._count} rows)`
    );
    console.log(
      `  10% × Gavin revenue:  ${m((gavinRow.revenue) * rate)}  |  10% × portal sales: ${m(portalSales * rate)}  |  actual override: ${m(portalOverride)}`
    );
    console.log(
      `  10% × Gavin commission: ${m(gavinRow.commission * rate)}  |  10% × portal comm: ${m(portalComm * rate)}`
    );

    // Per-row sum check: does sum(round(revenue*10%)) match stored overrides?
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trinId,
        type: "OVERRIDE",
        sourceAffiliateId: affiliateId,
        status: "UNPAID",
      },
      select: { amount: true, orderRevenue: true },
    });
    let recomputed = 0;
    for (const row of rows) {
      const sales = n(row.orderRevenue);
      recomputed += Math.round(sales * rate * 100) / 100;
    }
    console.log(
      `  Recomputed Σ round(sales×${(rate * 100).toFixed(0)}%): ${m(recomputed)} vs stored ${m(portalOverride)}`
    );
    console.log("");
  }

  if (blair) await memberBlock("Blair", blair.id, gavin.blair);
  if (emmie) await memberBlock("Emmie", emmie.id, gavin.emmie);

  const trinDirect = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trinId, type: "DIRECT", status: "UNPAID" },
    _sum: { amount: true },
  });
  const trinOverride = await prisma.ledgerEntry.aggregate({
    where: { affiliateId: trinId, type: "OVERRIDE", status: "UNPAID" },
    _sum: { amount: true },
  });
  const blairOvr = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trinId,
      type: "OVERRIDE",
      sourceAffiliateId: blair?.id,
      status: "UNPAID",
    },
    _sum: { amount: true },
  });
  const emmieOvr = await prisma.ledgerEntry.aggregate({
    where: {
      affiliateId: trinId,
      type: "OVERRIDE",
      sourceAffiliateId: emmie?.id,
      status: "UNPAID",
    },
    _sum: { amount: true },
  });

  console.log("=== TRIN TOTALS (UNPAID) ===");
  console.log(`  Gavin DIRECT:     ${m(gavin.trinDirect)}`);
  console.log(`  Portal DIRECT:    ${m(n(trinDirect._sum.amount))}`);
  console.log(`  Gavin team cut:   ${m(gavin.trinTeamCut)}  (= 10% × ${m(gavin.blair.revenue + gavin.emmie.revenue)})`);
  console.log(`  Portal OVERRIDE:  ${m(n(trinOverride._sum.amount))}`);
  console.log(`    Blair portion:  ${m(n(blairOvr._sum.amount))}`);
  console.log(`    Emmie portion:  ${m(n(emmieOvr._sum.amount))}`);
  console.log(`    Other members:  ${m(n(trinOverride._sum.amount) - n(blairOvr._sum.amount) - n(emmieOvr._sum.amount))}`);
  console.log(`  Gavin total:      ${m(gavin.total)}`);
  console.log(
    `  Portal total:     ${m(n(trinDirect._sum.amount) + n(trinOverride._sum.amount))}`
  );

  // --- Find which week Gavin's spreadsheet rows refer to -------------------
  const blairId = blair!.id;
  const emmieId = emmie!.id;

  function weekKey(d: Date): string {
    const dt = new Date(d);
    const day = dt.getUTCDay();
    const mon = new Date(dt);
    mon.setUTCDate(dt.getUTCDate() - ((day + 6) % 7));
    mon.setUTCHours(0, 0, 0, 0);
    return mon.toISOString().slice(0, 10);
  }

  type WeekTotals = { comm: number; sales: number; n: number };
  async function directByWeek(affiliateId: string): Promise<Map<string, WeekTotals>> {
    const rows = await prisma.ledgerEntry.findMany({
      where: { affiliateId, type: "DIRECT" },
      select: { amount: true, orderRevenue: true, occurredAt: true },
    });
    const map = new Map<string, WeekTotals>();
    for (const row of rows) {
      const key = weekKey(row.occurredAt);
      const cur = map.get(key) ?? { comm: 0, sales: 0, n: 0 };
      cur.comm += n(row.amount);
      cur.sales += n(row.orderRevenue);
      cur.n += 1;
      map.set(key, cur);
    }
    return map;
  }

  async function overrideByWeek(sourceAffiliateId: string): Promise<Map<string, WeekTotals>> {
    const rows = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: trinId,
        type: "OVERRIDE",
        sourceAffiliateId,
      },
      select: { amount: true, orderRevenue: true, occurredAt: true, status: true },
    });
    const map = new Map<string, WeekTotals>();
    for (const row of rows) {
      const key = weekKey(row.occurredAt);
      const cur = map.get(key) ?? { comm: 0, sales: 0, n: 0 };
      cur.comm += n(row.amount);
      cur.sales += n(row.orderRevenue);
      cur.n += 1;
      map.set(key, cur);
    }
    return map;
  }

  console.log("\n=== WEEKLY SCAN (Mon-start UTC, all statuses) ===");
  const blairWeeks = await directByWeek(blairId);
  const emmieWeeks = await directByWeek(emmieId);
  const trinWeeks = await directByWeek(trinId);
  const blairOvrWeeks = await overrideByWeek(blairId);
  const emmieOvrWeeks = await overrideByWeek(emmieId);

  const weeks = new Set([
    ...Array.from(blairWeeks.keys()),
    ...Array.from(emmieWeeks.keys()),
    ...Array.from(trinWeeks.keys()),
  ]);

  for (const wk of Array.from(weeks).sort().reverse().slice(0, 10)) {
    const b = blairWeeks.get(wk) ?? { comm: 0, sales: 0, n: 0 };
    const e = emmieWeeks.get(wk) ?? { comm: 0, sales: 0, n: 0 };
    const t = trinWeeks.get(wk) ?? { comm: 0, sales: 0, n: 0 };
    const bo = blairOvrWeeks.get(wk) ?? { comm: 0, sales: 0, n: 0 };
    const eo = emmieOvrWeeks.get(wk) ?? { comm: 0, sales: 0, n: 0 };
    const gavinMatch =
      Math.abs(b.comm - gavin.blair.commission) < 0.02 &&
      Math.abs(e.comm - gavin.emmie.commission) < 0.02;
    const portalTeam = bo.comm + eo.comm;
    const gavinTeam = gavin.trinTeamCut;
    console.log(
      `${wk}${gavinMatch ? "  <<< GAVIN ROW MATCH" : ""}\n` +
        `  Blair direct: ${m(b.comm)} / ${m(b.sales)}  → Trin override: ${m(bo.comm)} (10%×sales=${m(b.sales * 0.1)})\n` +
        `  Emmie direct: ${m(e.comm)} / ${m(e.sales)}  → Trin override: ${m(eo.comm)} (10%×sales=${m(e.sales * 0.1)})\n` +
        `  Trin direct:  ${m(t.comm)}\n` +
        `  Team cut portal: ${m(portalTeam)}  Gavin: ${m(gavinTeam)}  diff: ${m(portalTeam - gavinTeam)}`
    );
  }

  console.log("\n=== EMMIE ON TRIN'S TEAM? ===");
  const emmieMeta = await prisma.affiliate.findFirst({
    where: { slicewpId: 138 },
    select: {
      parentAffiliateId: true,
      parentSlicewpId: true,
      parentAffiliate: { select: { slicewpId: true, email: true } },
    },
  });
  console.log("  parentAffiliateId:", emmieMeta?.parentAffiliateId ?? "null");
  console.log("  parentSlicewpId:", emmieMeta?.parentSlicewpId ?? "null");
  console.log(
    "  linked parent:",
    emmieMeta?.parentAffiliate?.email ?? "none",
    `(#${emmieMeta?.parentAffiliate?.slicewpId ?? "?"})`,
    emmieMeta?.parentAffiliateId === trinId ? "← Trin" : "← NOT Trin"
  );
  const downline = await prisma.affiliate.findMany({
    where: { parentAffiliateId: trinId },
    select: { slicewpId: true, email: true },
    orderBy: { slicewpId: "asc" },
  });
  console.log(
    "  Trin downline:",
    downline.length,
    "members — Blair?",
    downline.some((m) => m.slicewpId === 81),
    "Emmie?",
    downline.some((m) => m.slicewpId === 138)
  );
  const emmieOvrAll = await prisma.ledgerEntry.groupBy({
    by: ["status"],
    where: {
      affiliateId: trinId,
      type: "OVERRIDE",
      sourceAffiliateId: emmieId,
    },
    _sum: { amount: true },
    _count: true,
  });
  console.log("  Emmie-sourced overrides for Trin (all time):", emmieOvrAll);

  console.log("\n=== PACIFIC WEEK WINDOWS (match Gavin's row totals?) ===");
  const windows: Array<[string, string, string]> = [
    ["Aug 25–31 PT", "2026-08-25T07:00:00.000Z", "2026-09-01T06:59:59.999Z"],
    ["Sep 1–7 PT", "2026-09-01T07:00:00.000Z", "2026-09-08T06:59:59.999Z"],
    ["Aug 31–Sep 6 PT", "2026-08-31T07:00:00.000Z", "2026-09-07T06:59:59.999Z"],
  ];

  async function sumDirect(
    affiliateId: string,
    from: Date,
    to: Date
  ): Promise<{ comm: number; sales: number }> {
    const agg = await prisma.ledgerEntry.aggregate({
      where: {
        affiliateId,
        type: "DIRECT",
        occurredAt: { gte: from, lte: to },
      },
      _sum: { amount: true, orderRevenue: true },
    });
    return { comm: n(agg._sum.amount), sales: n(agg._sum.orderRevenue) };
  }

  async function sumOverride(
    sourceAffiliateId: string,
    from: Date,
    to: Date
  ): Promise<{ cut: number; sales: number }> {
    const agg = await prisma.ledgerEntry.aggregate({
      where: {
        affiliateId: trinId,
        type: "OVERRIDE",
        sourceAffiliateId,
        occurredAt: { gte: from, lte: to },
      },
      _sum: { amount: true, orderRevenue: true },
    });
    return { cut: n(agg._sum.amount), sales: n(agg._sum.orderRevenue) };
  }

  for (const [label, start, end] of windows) {
    const from = new Date(start);
    const to = new Date(end);
    const b = await sumDirect(blairId, from, to);
    const e = await sumDirect(emmieId, from, to);
    const t = await sumDirect(trinId, from, to);
    const bo = await sumOverride(blairId, from, to);
    const eo = await sumOverride(emmieId, from, to);
    const portalTeam = bo.cut + eo.cut;
    const gavinTeam = (b.sales + e.sales) * 0.1;
    const match =
      Math.abs(b.comm - gavin.blair.commission) < 0.02 &&
      Math.abs(e.comm - gavin.emmie.commission) < 0.02;

    console.log(
      `${label}${match ? "  *** GAVIN COMMISSION MATCH ***" : ""}\n` +
        `  Blair:  comm ${m(b.comm)} (Gavin ${m(gavin.blair.commission)})  sales ${m(b.sales)} (Gavin ${m(gavin.blair.revenue)})\n` +
        `  Emmie:  comm ${m(e.comm)} (Gavin ${m(gavin.emmie.commission)})  sales ${m(e.sales)} (Gavin ${m(gavin.emmie.revenue)})\n` +
        `  Trin direct: ${m(t.comm)} (Gavin ${m(gavin.trinDirect)})\n` +
        `  Portal team cut: ${m(portalTeam)} (Blair ${m(bo.cut)} + Emmie ${m(eo.cut)})\n` +
        `  Gavin team cut (10%×sales): ${m(gavinTeam)}  diff: ${m(portalTeam - gavinTeam)}`
    );
  }

  await prisma.$disconnect();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
