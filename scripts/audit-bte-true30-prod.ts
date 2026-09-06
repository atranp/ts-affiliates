import { config } from "dotenv";

config({ path: ".env" });
config({ path: ".env.local", override: true });

if (process.env.BACKFILL_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  process.env.DIRECT_URL =
    process.env.BACKFILL_DIRECT_URL ?? process.env.BACKFILL_DATABASE_URL;
}

/** Source of truth: docs/reports/true30-export/generate-pdfs.py */
const PILOTS = [
  {
    name: "Blair",
    email: "blair@blairswish.com",
    expectedTotal: 404.04,
    orders: {
      10855: 42.51,
      10872: 29.97,
      10944: 29.97,
      10950: 26.99,
      11300: 17.54,
      11409: 11.99,
      11680: 21.85,
      11741: 23.43,
      11797: 30.27,
      11894: 31.64,
      11939: 17.54,
      12005: 62.99,
      12056: 33.59,
      12164: 23.76,
    },
  },
  {
    name: "Trin",
    email: "trindalyn.mackenzie11@gmail.com",
    expectedTotal: 282.09,
    orders: {
      11090: 17.79,
      11106: 96.47,
      11309: 43.01,
      11432: 20.79,
      11532: 42.13,
      11884: 17.79,
      12067: 44.11,
    },
  },
  {
    name: "Emmie",
    email: "emmiepayton1@gmail.com",
    expectedTotal: 394.79,
    orders: {
      10901: 85.03,
      11084: 48.08,
      11461: 26.99,
      11517: 17.54,
      11557: 34.64,
      11870: 37.59,
      11882: 31.6,
      11988: 31.19,
      12139: 13.34,
      12173: 41.07,
      12251: 14.38,
      12258: 13.34,
    },
  },
] as const;

function money(n: number | string | { toString(): string } | null | undefined) {
  if (n == null) return null;
  return Math.round(Number(n) * 100) / 100;
}

async function main() {
  const { isProductionDatabase } = await import("../lib/env-guard");
  if (!isProductionDatabase()) {
    throw new Error("DATABASE_URL is not production — set BACKFILL_DATABASE_URL");
  }

  const { prisma } = await import("../lib/prisma");

  console.log("B/T/E TRUE30 prod audit\n");

  let allPass = true;

  for (const pilot of PILOTS) {
    const affiliate = await prisma.affiliate.findFirst({
      where: {
        OR: [
          { email: { equals: pilot.email, mode: "insensitive" } },
          { displayName: { contains: pilot.name, mode: "insensitive" } },
        ],
      },
      select: { id: true, displayName: true, email: true, slicewpId: true },
    });

    if (!affiliate) {
      console.log(`── ${pilot.name} ── NOT FOUND`);
      allPass = false;
      continue;
    }

    console.log(
      `── ${affiliate.displayName ?? pilot.name} <${affiliate.email}> slicewp=${affiliate.slicewpId} ──`
    );

    const orderIds = Object.keys(pilot.orders).map(Number);
    const ledger = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: affiliate.id,
        wooOrderId: { in: orderIds },
      },
      select: {
        wooOrderId: true,
        amount: true,
        status: true,
        occurredAt: true,
        sourceCommission: {
          select: {
            amount: true,
            winningRule: true,
            customerSlicewpId: true,
            visitSlicewpId: true,
          },
        },
      },
      orderBy: { wooOrderId: "asc" },
    });

    const byOrder = new Map(
      ledger.map((row) => [row.wooOrderId!, row] as const)
    );

    let pdfSum = 0;
    let portalSum = 0;
    const mismatches: string[] = [];
    const missing: number[] = [];

    for (const [orderIdStr, pdfAmount] of Object.entries(pilot.orders)) {
      const orderId = Number(orderIdStr);
      pdfSum += pdfAmount;
      const row = byOrder.get(orderId);
      if (!row) {
        missing.push(orderId);
        allPass = false;
        continue;
      }
      const portalAmount = money(row.amount)!;
      portalSum += portalAmount;
      if (portalAmount !== pdfAmount) {
        mismatches.push(
          `#${orderId}: PDF $${pdfAmount.toFixed(2)} vs portal $${portalAmount.toFixed(2)}`
        );
        allPass = false;
      }
    }

    console.log(
      `  PDF orders: ${orderIds.length} found ${ledger.length} missing ${missing.length}`
    );
    console.log(
      `  PDF total:    $${pdfSum.toFixed(2)} (expected $${pilot.expectedTotal.toFixed(2)})`
    );
    console.log(`  Portal total: $${portalSum.toFixed(2)} on matched rows`);

    if (missing.length) {
      console.log(`  MISSING in ledger: ${missing.map((id) => `#${id}`).join(", ")}`);
    }
    if (mismatches.length) {
      console.log("  AMOUNT MISMATCH:");
      for (const line of mismatches) console.log(`    ${line}`);
    } else if (!missing.length) {
      console.log("  ✓ All order amounts match PDF");
    }

    // Journey / winningRule spot-check on key orders
    const spotChecks: Record<string, number[]> = {
      Blair: [10855, 10950, 12005, 12164],
      Trin: [11106, 11090, 12067],
      Emmie: [10901, 11084, 12173, 12258],
    };
    console.log("  Spot-check drawer fields:");
    for (const orderId of spotChecks[pilot.name as keyof typeof spotChecks] ?? []) {
      const row = byOrder.get(orderId);
      if (!row) {
        console.log(`    #${orderId}: missing`);
        continue;
      }
      const sc = row.sourceCommission;
      console.log(
        `    #${orderId}: $${money(row.amount)} status=${row.status} winningRule=${sc?.winningRule ?? "—"} customer=${sc?.customerSlicewpId ?? "—"} visit=${sc?.visitSlicewpId ?? "—"}`
      );
    }

    // Trin lifetime example from QA doc
    if (pilot.name === "Trin") {
      const lifetime = await prisma.ledgerEntry.findFirst({
        where: { affiliateId: affiliate.id, wooOrderId: 12341 },
        select: {
          wooOrderId: true,
          amount: true,
          sourceCommission: {
            select: { winningRule: true, customerSlicewpId: true },
          },
        },
      });
      console.log(
        lifetime
          ? `  Lifetime check #12341: $${money(lifetime.amount)} winningRule=${lifetime.sourceCommission?.winningRule ?? "—"} customer=${lifetime.sourceCommission?.customerSlicewpId ?? "—"}`
          : "  Lifetime check #12341: not in ledger"
      );
    }

    console.log("");
  }

  // Extra: orders credited to wrong affiliate (coupon owner) — sample TRUE30 period
  console.log("── Cross-affiliate sanity (TRUE30 orders on B/T/E only) ──");
  for (const pilot of PILOTS) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { email: { equals: pilot.email, mode: "insensitive" } },
      select: { id: true, displayName: true },
    });
    if (!affiliate) continue;
    const orderIds = Object.keys(pilot.orders).map(Number);
    const wrongOwner = await prisma.ledgerEntry.findMany({
      where: {
        wooOrderId: { in: orderIds },
        affiliateId: { not: affiliate.id },
      },
      select: {
        wooOrderId: true,
        amount: true,
        affiliate: { select: { displayName: true } },
      },
    });
    if (wrongOwner.length) {
      allPass = false;
      console.log(`  ${pilot.name}: ${wrongOwner.length} TRUE30 orders credited elsewhere`);
      for (const row of wrongOwner.slice(0, 5)) {
        console.log(
          `    #${row.wooOrderId} → ${row.affiliate.displayName} $${money(row.amount)}`
        );
      }
    } else {
      console.log(`  ${pilot.name}: all TRUE30 orders credited to ${affiliate.displayName}`);
    }
  }

  console.log(`\n${allPass ? "PASS" : "FAIL"} — see details above`);

  // Ownership deep-dive when TRUE30 rows aren't on the pilot affiliate
  console.log("\n── SliceWP commission owner (Commission table) ──");
  const sampleOrderIds = [10855, 11106, 10901];
  for (const orderId of sampleOrderIds) {
    const rows = await prisma.commission.findMany({
      where: { wooOrderId: orderId },
      select: {
        amount: true,
        winningRule: true,
        affiliate: { select: { displayName: true, slicewpId: true } },
      },
    });
    console.log(
      `  #${orderId}: ${rows.map((r) => `${r.affiliate.displayName} (sw${r.affiliate.slicewpId}) $${money(r.amount)} rule=${r.winningRule ?? "—"}`).join(" | ") || "no commission row"}`
    );
  }

  const adsAffiliate = await prisma.affiliate.findFirst({
    where: { displayName: { contains: "ads", mode: "insensitive" } },
    select: { id: true, displayName: true, slicewpId: true, email: true },
  });
  if (adsAffiliate) {
    console.log(
      `\n  Coupon-side affiliate: ${adsAffiliate.displayName} slicewp=${adsAffiliate.slicewpId} ${adsAffiliate.email ?? ""}`
    );
    const adsTrue30Count = await prisma.ledgerEntry.count({
      where: {
        affiliateId: adsAffiliate.id,
        wooOrderId: {
          in: PILOTS.flatMap((p) => Object.keys(p.orders).map(Number)),
        },
      },
    });
    console.log(`  Holds ${adsTrue30Count}/33 TRUE30 PDF orders in ledger`);
  }

  for (const pilot of PILOTS) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { email: { equals: pilot.email, mode: "insensitive" } },
      select: { id: true, displayName: true },
    });
    if (!affiliate) continue;
    const [total, inPeriod] = await Promise.all([
      prisma.ledgerEntry.count({ where: { affiliateId: affiliate.id } }),
      prisma.ledgerEntry.count({
        where: {
          affiliateId: affiliate.id,
          occurredAt: {
            gte: new Date("2026-08-21T00:00:00-07:00"),
            lte: new Date("2026-09-03T23:59:59-07:00"),
          },
        },
      }),
    ]);
    console.log(
      `  ${affiliate.displayName}: ${total} ledger rows total, ${inPeriod} in Aug 21–Sep 3 PT window`
    );

    const true30Ids = Object.keys(pilot.orders).map(Number);
    const otherSample = await prisma.ledgerEntry.findMany({
      where: {
        affiliateId: affiliate.id,
        occurredAt: {
          gte: new Date("2026-08-21T00:00:00-07:00"),
          lte: new Date("2026-09-03T23:59:59-07:00"),
        },
        wooOrderId: { notIn: true30Ids },
      },
      orderBy: { amount: "desc" },
      take: 2,
      select: {
        wooOrderId: true,
        amount: true,
        sourceCommission: { select: { winningRule: true } },
      },
    });
    if (otherSample.length) {
      console.log(
        `    Sample non-TRUE30 rows: ${otherSample
          .map(
            (r) =>
              `#${r.wooOrderId} $${money(r.amount)} rule=${r.sourceCommission?.winningRule ?? "—"}`
          )
          .join("; ")}`
      );
    }
  }

  console.log("\n── PDF credit vs live SliceWP (spot orders) ──");
  for (const pilot of PILOTS) {
    const pdfOrders: Record<number, number> = pilot.orders;
    const spot = [
      10855, 10950, 12005, 12164, 11106, 11090, 12067, 10901, 11084, 12173,
      12258,
    ].filter((id) => id in pdfOrders);
    for (const orderId of spot) {
      const pdfAmount = pdfOrders[orderId]!;
      const commission = await prisma.commission.findFirst({
        where: { wooOrderId: orderId },
        select: {
          amount: true,
          affiliate: { select: { displayName: true } },
        },
      });
      const sw = commission ? money(commission.amount)! : null;
      const tag =
        sw === pdfAmount
          ? "match"
          : sw == null
            ? "no SliceWP row"
            : `SliceWP $${sw} on ${commission!.affiliate.displayName}`;
      console.log(`  ${pilot.name} #${orderId}: PDF $${pdfAmount.toFixed(2)} → ${tag}`);
    }
  }

  await prisma.$disconnect();
  process.exit(allPass ? 0 : 1);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
