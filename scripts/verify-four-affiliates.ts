import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });
process.env.DATABASE_URL = prodDatabaseUrl();

/**
 * Read-only full reconciliation for the four affiliates ops cares about most.
 * Fails the process if any check exceeds the tolerance.
 */

const AFFILIATES = [
  { slicewpId: 51, name: "Trindalyn Mackenzie", role: "sponsor" as const },
  { slicewpId: 81, name: "Blair Rodgers", role: "recruit" as const },
  { slicewpId: 138, name: "Emmie Payton", role: "recruit" as const },
  { slicewpId: 124, name: "Dd Perez", role: "recruit" as const },
];

const TOL = 0.02; // cents-level float noise

function money(v: number) {
  return `$${v.toFixed(2)}`;
}

function round(v: number) {
  return Math.round(v * 100) / 100;
}

type Issue = { who: string; check: string; detail: string };

async function main() {
  const { prisma } = await import("../lib/prisma");
  const { toNumber } = await import("../lib/format");
  const { getAffiliatePerformance } = await import("../lib/affiliate/performance");
  const { resolvePeriod } = await import("../lib/affiliate/period");
  const { getPayoutOptions } = await import("../lib/payouts/options");
  const { getSlicewpPayoutDetail } = await import("../lib/payouts/slicewp-queries");
  const { getTeamsForSponsor, getTeamDetail } = await import("../lib/teams/queries");
  const { getLedgerResponse } = await import("../lib/ledger/queries");
  const { listDirectPayoutAnchorsForMember } = await import(
    "../lib/payouts/direct-payout-ref"
  );
  const { calculateOverrideAmount, getCommissionDivisor } = await import(
    "../lib/deal-rules"
  );

  const issues: Issue[] = [];
  const ok: string[] = [];

  function fail(who: string, check: string, detail: string) {
    issues.push({ who, check, detail });
  }
  function pass(who: string, msg: string) {
    ok.push(`${who}: ${msg}`);
  }

  const trin = await prisma.affiliate.findFirst({
    where: { slicewpId: 51 },
    select: { id: true },
  });

  // ── Per-affiliate checks ────────────────────────────────────────────────

  for (const spec of AFFILIATES) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId: spec.slicewpId },
      select: { id: true, displayName: true, email: true },
    });
    if (!affiliate) {
      fail(spec.name, "exists", "affiliate not found");
      continue;
    }
    const who = affiliate.displayName ?? spec.name;

    // 1. Home "commissionable sales generated" = ledger DIRECT net sum
    const { range, previous } = resolvePeriod({ key: "all" });
    const perf = await getAffiliatePerformance(affiliate.id, range, previous);
    const [ledgerNet] = await prisma.$queryRaw<[{ net: number }]>`
      SELECT COALESCE(SUM(COALESCE("commissionBase", "orderRevenue")), 0)::float AS net
      FROM "LedgerEntry"
      WHERE "affiliateId" = ${affiliate.id} AND "type" = 'DIRECT'
    `;
    const net = ledgerNet?.net ?? 0;
    if (Math.abs(perf.current.revenue - net) > TOL) {
      fail(
        who,
        "home sales generated",
        `portal ${money(perf.current.revenue)} ≠ ledger ${money(net)}`
      );
    } else {
      pass(who, `home commissionable sales ${money(net)} = ledger`);
    }

    // 2. Earnings on home = all ledger amounts (direct + override + other)
    const [ledgerEarn] = await prisma.$queryRaw<[{ t: number }]>`
      SELECT COALESCE(SUM("amount"), 0)::float AS t FROM "LedgerEntry"
      WHERE "affiliateId" = ${affiliate.id}
    `;
    if (Math.abs(perf.current.earnings - (ledgerEarn?.t ?? 0)) > TOL) {
      fail(
        who,
        "home earnings",
        `portal ${money(perf.current.earnings)} ≠ ledger ${money(ledgerEarn?.t ?? 0)}`
      );
    } else {
      pass(who, `home earnings ${money(perf.current.earnings)} = ledger`);
    }

    // 3. Every paid SliceWP payment: amount = Σ commission amounts
    const payments = await prisma.slicewpPayment.findMany({
      where: { affiliateId: affiliate.id, status: "paid" },
      select: {
        id: true,
        slicewpPaymentId: true,
        amount: true,
        commissionIds: true,
        dateCreated: true,
      },
      orderBy: { dateCreated: "desc" },
      take: 12,
    });

    for (const payment of payments) {
      const commissions = await prisma.commission.findMany({
        where: {
          affiliateId: affiliate.id,
          slicewpId: { in: payment.commissionIds },
        },
        select: { amount: true },
      });
      const commSum = commissions.reduce((s, c) => s + toNumber(c.amount), 0);
      const payAmt = toNumber(payment.amount);
      const gap = payAmt - commSum;
      if (Math.abs(gap) > TOL) {
        fail(
          who,
          `SliceWP payout #${payment.slicewpPaymentId}`,
          `payment ${money(payAmt)} ≠ Σ commissions ${money(commSum)} (gap ${money(gap)})`
        );
      }

      // 4. Payout detail sale column = Σ commissionable on those commissions
      const detail = await getSlicewpPayoutDetail(payment.id, {
        affiliateId: affiliate.id,
      });
      const fullComm = await prisma.commission.findMany({
        where: {
          affiliateId: affiliate.id,
          slicewpId: { in: payment.commissionIds },
        },
        select: {
          type: true,
          amount: true,
          orderRevenue: true,
          commissionBase: true,
          parentSlicewpId: true,
        },
      });

      const parentIds = fullComm
        .map((c) => c.parentSlicewpId)
        .filter((id): id is number => !!id);
      const parents = parentIds.length
        ? await prisma.commission.findMany({
            where: { slicewpId: { in: parentIds } },
            select: { slicewpId: true, orderRevenue: true, commissionBase: true },
          })
        : [];
      const parentBy = new Map(parents.map((p) => [p.slicewpId, p]));

      let expectedDetailSales = 0;
      for (const c of fullComm) {
        const isInherit = (c.type ?? "").toLowerCase() === "inherit";
        const parent = c.parentSlicewpId
          ? parentBy.get(c.parentSlicewpId)
          : undefined;
        const base = toNumber(c.commissionBase);
        const gross = toNumber(c.orderRevenue);
        const sale = base > 0 ? base : gross > 0 ? gross : parent
          ? toNumber(parent.commissionBase) || toNumber(parent.orderRevenue)
          : 0;
        if (isInherit && sale > 0) expectedDetailSales += sale;
        else if (!isInherit && sale > 0) expectedDetailSales += sale;
      }
      expectedDetailSales = round(expectedDetailSales);

      const detailSales = round(
        detail?.entries.reduce((s, e) => s + (e.orderRevenue ?? 0), 0) ?? 0
      );
      if (detail && Math.abs(detailSales - expectedDetailSales) > TOL) {
        fail(
          who,
          `payout detail sales #${payment.slicewpPaymentId}`,
          `detail ${money(detailSales)} ≠ expected ${money(expectedDetailSales)}`
        );
      }

      // 5. Ledger DIRECT mirrors commission amount + gross orderRevenue
      const ledgerMismatch = await prisma.$queryRaw<[{ n: bigint }]>`
        SELECT COUNT(*)::bigint AS n
        FROM "LedgerEntry" le
        JOIN "Commission" c ON c."id" = le."sourceCommissionId"
        WHERE le."affiliateId" = ${affiliate.id}
          AND le."type" = 'DIRECT'
          AND c."slicewpId" = ANY(${payment.commissionIds}::int[])
          AND (
            le."amount" IS DISTINCT FROM c."amount"
            OR le."orderRevenue" IS DISTINCT FROM c."orderRevenue"
          )
      `;
      if (Number(ledgerMismatch[0]?.n ?? 0) > 0) {
        fail(
          who,
          `ledger mirror #${payment.slicewpPaymentId}`,
          `${ledgerMismatch[0]?.n} DIRECT rows ≠ commission amount/gross`
        );
      }
    }
    if (payments.length > 0) {
      pass(
        who,
        `${payments.length} SliceWP payouts: amounts + detail sales + ledger mirror`
      );
    }

    // 6. Commissions tab unpaid total = ledger accountSummary
    const ledger = await getLedgerResponse({
      affiliateId: affiliate.id,
      limit: 1,
    });
    const unpaidLedger = await prisma.ledgerEntry.aggregate({
      where: { affiliateId: affiliate.id, status: "UNPAID" },
      _sum: { amount: true },
    });
    if (
      Math.abs(
        ledger.accountSummary.unpaidTotal - toNumber(unpaidLedger._sum.amount)
      ) > TOL
    ) {
      fail(
        who,
        "ready for payout",
        `accountSummary ${money(ledger.accountSummary.unpaidTotal)} ≠ UNPAID sum ${money(toNumber(unpaidLedger._sum.amount))}`
      );
    } else {
      pass(who, `ready for payout ${money(ledger.accountSummary.unpaidTotal)}`);
    }
  }

  // ── Trin team: roster vs overrides vs payout options ─────────────────────

  if (trin) {
    const who = "Trindalyn Mackenzie";
    const teams = await getTeamsForSponsor(trin.id);
    const team = teams[0];
    if (team) {
      const detail = await getTeamDetail(team.id);
      const memberSum = (detail?.members ?? []).reduce(
        (s, m) => s + m.stats.totalRevenue,
        0
      );
      if (Math.abs(memberSum - team.stats.totalRevenue) > TOL) {
        fail(
          who,
          "team sales aggregate",
          `Σ members ${money(memberSum)} ≠ team card ${money(team.stats.totalRevenue)}`
        );
      } else {
        pass(
          who,
          `team commissionable sales ${money(team.stats.totalRevenue)} = Σ roster`
        );
      }

      // Member unpaid team cut = sum of overrides
      for (const m of detail?.members ?? []) {
        if (![81, 138, 124].includes(
          (await prisma.affiliate.findUnique({
            where: { id: m.id },
            select: { slicewpId: true },
          }))?.slicewpId ?? 0
        )) {
          continue;
        }
        const ovr = await prisma.ledgerEntry.aggregate({
          where: {
            affiliateId: trin.id,
            type: "OVERRIDE",
            status: "UNPAID",
            sourceAffiliateId: m.id,
          },
          _sum: { amount: true },
        });
        const gap = m.stats.unpaidTeamBonus - toNumber(ovr._sum.amount);
        if (Math.abs(gap) > TOL) {
          fail(
            who,
            `${m.displayName} team cut`,
            `roster ${money(m.stats.unpaidTeamBonus)} ≠ UNPAID overrides ${money(toNumber(ovr._sum.amount))}`
          );
        }
      }
      pass(who, "Blair/Emmie/Dd roster team cuts = UNPAID override sums");
    }

    // Payout options: every row = Gavin per-row ÷3
    const options = await getPayoutOptions({
      affiliateId: trin.id,
      cutoff: new Date(),
    });
    const teamOpt = options.teams[0];
    let optionSum = 0;
    let gavinSum = 0;

    for (const row of teamOpt?.members ?? []) {
      optionSum += row.amount;
      if (row.target.scope !== "member" || !row.target.directPayout) continue;

      const memberId = row.target.memberId;
      const ref = row.target.directPayout;
      let commissionIds: string[] = [];
      if (ref.source === "slicewp") {
        const payment = await prisma.slicewpPayment.findFirst({
          where: { id: ref.paymentId },
          select: { commissionIds: true },
        });
        if (payment) {
          const comms = await prisma.commission.findMany({
            where: {
              affiliateId: memberId,
              slicewpId: { in: payment.commissionIds },
            },
            select: { id: true, amount: true, orderRevenue: true, commissionBase: true },
          });
          commissionIds = comms.map((c) => c.id);

          const rule = await prisma.dealRule.findFirst({
            where: { sponsorAffiliateId: trin.id, active: true, teamId: { not: null } },
          });
          if (rule) {
            let expected = 0;
            for (const c of comms) {
              expected += calculateOverrideAmount(rule, c);
            }
            gavinSum += expected;
            const gap = row.amount - expected;
            if (Math.abs(gap) > TOL) {
              fail(
                who,
                `payout option ${row.label}`,
                `portal ${money(row.amount)} ≠ Gavin ${money(expected)} (sales line ${money(row.revenue)})`
              );
            }
            if (Math.abs(row.revenue - comms.reduce(
              (s, c) => s + toNumber(c.commissionBase ?? c.orderRevenue),
              0
            )) > TOL) {
              fail(
                who,
                `payout option sales ${row.label}`,
                `revenue line ${money(row.revenue)} ≠ Σ commissionable`
              );
            }
          }
        }
      }
    }

    if (teamOpt && Math.abs(optionSum - teamOpt.amount) > TOL) {
      fail(
        who,
        "payout options total",
        `Σ rows ${money(optionSum)} ≠ team header ${money(teamOpt.amount)}`
      );
    } else if (teamOpt) {
      pass(
        who,
        `${teamOpt.members.length} payout rows total ${money(teamOpt.amount)} = Gavin ${money(gavinSum)}`
      );
    }

    // Global: all Trin UNPAID overrides priced with ÷3 rule
    const rule = await prisma.dealRule.findFirst({
      where: { sponsorAffiliateId: trin.id, active: true, teamId: { not: null } },
    });
    if (rule && getCommissionDivisor(rule) !== 3) {
      fail(who, "team rule", `expected divisor 3, got ${JSON.stringify(rule.metadata)}`);
    }

    const unpaidOverrides = await prisma.ledgerEntry.findMany({
      where: { affiliateId: trin.id, type: "OVERRIDE", status: "UNPAID" },
      select: {
        amount: true,
        sourceCommission: {
          select: { amount: true, orderRevenue: true, commissionBase: true },
        },
      },
    });
    let mispriced = 0;
    for (const row of unpaidOverrides) {
      if (!row.sourceCommission || !rule) continue;
      const expected = calculateOverrideAmount(rule, row.sourceCommission);
      if (Math.abs(toNumber(row.amount) - expected) >= 0.005) mispriced += 1;
    }
    if (mispriced > 0) {
      fail(who, "override pricing", `${mispriced} UNPAID rows ≠ commission ÷ 3`);
    } else {
      pass(
        who,
        `all ${unpaidOverrides.length} UNPAID overrides priced as commission ÷ 3`
      );
    }
  }

  // ── Blair/Emmie/Dd: member sales = countable revenue ─────────────────────

  const trinTeamId = trin
    ? (await getTeamsForSponsor(trin.id))[0]?.id
    : undefined;

  for (const slicewpId of [81, 138, 124]) {
    const affiliate = await prisma.affiliate.findFirst({
      where: { slicewpId },
      select: { id: true, displayName: true },
    });
    if (!affiliate || !trinTeamId) continue;
    const who = affiliate.displayName ?? `#${slicewpId}`;

    const { countableRevenueForAffiliate } = await import("../lib/revenue");
    const countable = await countableRevenueForAffiliate(affiliate.id);

    const detail = await getTeamDetail(trinTeamId);
    const member = detail?.members.find((m) => m.id === affiliate.id);
    if (member && Math.abs(member.stats.totalRevenue - countable) > TOL) {
      fail(
        who,
        "roster sales",
        `roster ${money(member.stats.totalRevenue)} ≠ countable ${money(countable)}`
      );
    } else if (member) {
      pass(who, `roster commissionable sales ${money(countable)}`);
    }
  }

  // ── Report ──────────────────────────────────────────────────────────────

  console.log("=".repeat(72));
  console.log("FOUR-AFFILIATE RECONCILIATION");
  console.log("=".repeat(72));
  console.log(`\n✓ PASSED (${ok.length})\n`);
  for (const line of ok) console.log(`  ${line}`);

  if (issues.length > 0) {
    console.log(`\n✗ FAILED (${issues.length})\n`);
    for (const i of issues) {
      console.log(`  [${i.who}] ${i.check}`);
      console.log(`    ${i.detail}`);
    }
    process.exitCode = 1;
  } else {
    console.log("\nAll checks passed.");
  }
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
