import { config } from "dotenv";
import { prodDatabaseUrl } from "./prod-env";

config({ path: ".env" });
config({ path: ".env.local", override: true });

/**
 * Puts one roster member on a different team-deal rate than the rest.
 *
 * The rate is written into the team rule's `memberRates` metadata rather than
 * as a rule of its own, because deal rules are additive — a recruit-scoped rule
 * fires alongside the team rule and the sponsor would earn both rates. See
 * `resolveRateForMember` for how the divisor is derived from the rule's.
 *
 * Unpaid and pending overrides are repriced in place. Paid rows record money
 * that already moved and are left alone.
 *
 *   npx tsx scripts/set-member-rate-exception.ts --member 124 --rate 12.5
 *   npx tsx scripts/set-member-rate-exception.ts --member 124 --rate 12.5 --apply
 *   npx tsx scripts/set-member-rate-exception.ts --member 124 --clear --apply
 */

function arg(flag: string): string | null {
  const index = process.argv.indexOf(flag);
  if (index === -1) return null;
  return process.argv[index + 1] ?? null;
}

async function main() {
  const apply = process.argv.includes("--apply");
  const clear = process.argv.includes("--clear");
  const memberSlicewpId = Number(arg("--member"));
  const rate = clear ? null : Number(arg("--rate"));

  if (!Number.isInteger(memberSlicewpId)) {
    throw new Error("Pass --member <slicewpId>");
  }
  if (!clear && (!rate || rate <= 0)) {
    throw new Error("Pass --rate <percent> or --clear");
  }

  if (process.env.BACKFILL_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.BACKFILL_DATABASE_URL;
  } else if (!process.env.DATABASE_URL?.includes("localhost")) {
    process.env.DATABASE_URL = prodDatabaseUrl();
  }

  const { Prisma } = await import("@prisma/client");
  const { prisma } = await import("../lib/prisma");
  const { calculateOverrideAmount, parseDealRuleMetadata, resolveRateForMember } =
    await import("../lib/deal-rules");
  const { toNumber } = await import("../lib/format");
  const { getTeamMemberIds } = await import("../lib/teams/members");

  const m = (v: number) => `$${v.toFixed(2)}`;

  const member = await prisma.affiliate.findFirst({
    where: { slicewpId: memberSlicewpId },
    select: { id: true, displayName: true, email: true },
  });
  if (!member) throw new Error(`No affiliate with slicewpId ${memberSlicewpId}`);

  const teamRules = await prisma.dealRule.findMany({
    where: { active: true, sourceAffiliateId: null, teamId: { not: null } },
  });

  const covering: typeof teamRules = [];
  for (const rule of teamRules) {
    if (!rule.teamId) continue;
    const memberIds = await getTeamMemberIds(rule.teamId);
    if (memberIds.includes(member.id)) covering.push(rule);
  }

  if (covering.length === 0) {
    throw new Error(`No active team rule covers ${member.displayName}`);
  }
  if (covering.length > 1) {
    throw new Error(
      `${member.displayName} is covered by ${covering.length} team rules ` +
        `(${covering.map((r) => r.name).join(", ")}); resolve by hand`
    );
  }

  const rule = covering[0]!;
  const metadata = parseDealRuleMetadata(rule.metadata);

  const nextMemberRates = { ...(metadata.memberRates ?? {}) };
  if (clear) {
    delete nextMemberRates[member.id];
  } else {
    nextMemberRates[member.id] = { ratePercent: rate! };
  }

  const nextMetadata = {
    ...(metadata.commissionDivisor
      ? { commissionDivisor: metadata.commissionDivisor }
      : {}),
    ...(Object.keys(nextMemberRates).length > 0
      ? { memberRates: nextMemberRates }
      : {}),
  };

  const before = resolveRateForMember(rule, member.id);
  const after = resolveRateForMember(
    { ratePercent: rule.ratePercent, metadata: nextMetadata },
    member.id
  );

  console.log(`=== ${rule.name} · ${member.displayName ?? member.email} ===`);
  console.log(
    `  rule rate ${rule.ratePercent.toString()}%` +
      `${metadata.commissionDivisor ? ` ÷ ${metadata.commissionDivisor}` : ""}`
  );
  console.log(
    `  member ${before.ratePercent}%${
      before.commissionDivisor ? ` ÷ ${before.commissionDivisor}` : ""
    } → ${after.ratePercent}%${
      after.commissionDivisor ? ` ÷ ${after.commissionDivisor}` : ""
    }`
  );

  const rows = await prisma.ledgerEntry.findMany({
    where: {
      dealRuleId: rule.id,
      type: "OVERRIDE",
      sourceAffiliateId: member.id,
      status: { in: ["UNPAID", "PENDING"] },
    },
    select: {
      id: true,
      amount: true,
      sourceCommission: {
        select: { amount: true, orderRevenue: true, commissionBase: true },
      },
    },
  });

  const priced = { ...rule, metadata: nextMetadata };
  const updates: Array<{ id: string; amount: number }> = [];
  let oldTotal = 0;
  let newTotal = 0;

  for (const row of rows) {
    if (!row.sourceCommission) continue;
    const next = calculateOverrideAmount(priced, row.sourceCommission, member.id);
    oldTotal += toNumber(row.amount);
    newTotal += next;
    if (Math.abs(next - toNumber(row.amount)) >= 0.005) {
      updates.push({ id: row.id, amount: next });
    }
  }

  const paid = await prisma.ledgerEntry.aggregate({
    where: {
      dealRuleId: rule.id,
      type: "OVERRIDE",
      sourceAffiliateId: member.id,
      status: "PAID",
    },
    _sum: { amount: true },
    _count: true,
  });

  console.log(
    `  unpaid/pending: ${rows.length} rows · ${m(oldTotal)} → ${m(newTotal)} ` +
      `(${m(newTotal - oldTotal)}) · ${updates.length} change`
  );
  console.log(
    `  paid: ${paid._count} rows · ${m(toNumber(paid._sum.amount))} left alone`
  );

  if (!apply) {
    console.log("\nDry run — pass --apply to write.");
    return;
  }

  await prisma.dealRule.update({
    where: { id: rule.id },
    data: { metadata: nextMetadata },
  });
  console.log(`\n  metadata → ${JSON.stringify(nextMetadata)}`);

  const CHUNK = 500;
  let written = 0;
  for (let start = 0; start < updates.length; start += CHUNK) {
    const chunk = updates.slice(start, start + CHUNK);
    const values = Prisma.join(
      chunk.map(
        (row) => Prisma.sql`(${row.id}::text, ${row.amount.toFixed(2)}::numeric)`
      )
    );
    written += await prisma.$executeRaw`
      UPDATE "LedgerEntry" AS le
      SET "amount" = v.amount, "updatedAt" = NOW()
      FROM (VALUES ${values}) AS v(id, amount)
      WHERE le."id" = v.id
        AND le."status" IN ('UNPAID', 'PENDING')
    `;
  }
  console.log(`  repriced ${written} rows`);
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
