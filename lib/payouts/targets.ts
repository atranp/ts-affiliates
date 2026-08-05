import { LedgerEntryType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { toNumber } from "@/lib/utils";
import { buildPayoutEntryWhere } from "./scope";
import type { PayoutDateBasis, PayoutScope } from "./types";

export type PayoutTargetOption = {
  /** Stable identity for selection, since scope alone is not unique. */
  key: string;
  scope: PayoutScope;
  teamId?: string;
  sourceAffiliateId?: string;
  label: string;
  sublabel: string;
  amount: number;
  entryCount: number;
  sourceRevenue: number;
  /** Recruit options are nested under their team for display. */
  parentKey?: string;
};

function plural(n: number, one: string, many = `${one}s`) {
  return `${n} ${n === 1 ? one : many}`;
}

/**
 * Everything the admin could pay this sponsor for, with amounts already scoped
 * to the chosen period. Showing per-period figures on the options themselves
 * avoids the old trap of picking a target based on an all-time total and then
 * being surprised by a smaller number in the preview.
 */
export async function getPayoutTargets(options: {
  sponsorAffiliateId: string;
  periodStart: Date;
  periodEnd: Date;
  dateBasis?: PayoutDateBasis;
}): Promise<{ targets: PayoutTargetOption[] }> {
  const where = buildPayoutEntryWhere({
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    sponsorAffiliateId: options.sponsorAffiliateId,
    scope: "all",
    dateBasis: options.dateBasis,
  });

  const entries = await prisma.ledgerEntry.findMany({
    where,
    select: {
      type: true,
      amount: true,
      orderRevenue: true,
      sourceAffiliate: { select: { id: true, displayName: true, email: true } },
      dealRule: {
        select: { teamId: true, team: { select: { id: true, name: true } } },
      },
    },
  });

  type Bucket = {
    amount: number;
    entryCount: number;
    sourceRevenue: number;
    name: string;
  };

  const teams = new Map<string, Bucket>();
  const recruits = new Map<string, Bucket & { teamId: string }>();
  let direct: Bucket = { amount: 0, entryCount: 0, sourceRevenue: 0, name: "" };

  for (const entry of entries) {
    const amount = toNumber(entry.amount);
    const revenue = toNumber(entry.orderRevenue);

    if (entry.type === LedgerEntryType.DIRECT) {
      direct = {
        ...direct,
        amount: direct.amount + amount,
        entryCount: direct.entryCount + 1,
        sourceRevenue: direct.sourceRevenue + revenue,
      };
      continue;
    }

    if (entry.type !== LedgerEntryType.OVERRIDE) continue;

    const team = entry.dealRule?.team;
    if (team) {
      const current = teams.get(team.id) ?? {
        amount: 0,
        entryCount: 0,
        sourceRevenue: 0,
        name: team.name,
      };
      current.amount += amount;
      current.entryCount += 1;
      current.sourceRevenue += revenue;
      teams.set(team.id, current);
    }

    const recruit = entry.sourceAffiliate;
    if (recruit && team) {
      const current = recruits.get(recruit.id) ?? {
        amount: 0,
        entryCount: 0,
        sourceRevenue: 0,
        name: recruit.displayName ?? recruit.email,
        teamId: team.id,
      };
      current.amount += amount;
      current.entryCount += 1;
      current.sourceRevenue += revenue;
      recruits.set(recruit.id, current);
    }
  }

  const targets: PayoutTargetOption[] = [];

  for (const [teamId, team] of Array.from(teams.entries())) {
    const teamKey = `team:${teamId}`;
    const teamRecruits = Array.from(recruits.entries())
      .filter(([, r]) => r.teamId === teamId)
      .sort((a, b) => a[1].name.localeCompare(b[1].name));

    targets.push({
      key: teamKey,
      scope: "team",
      teamId,
      label: team.name,
      sublabel: `Whole team · ${plural(teamRecruits.length, "recruit")} · ${plural(team.entryCount, "sale")}`,
      amount: team.amount,
      entryCount: team.entryCount,
      sourceRevenue: team.sourceRevenue,
    });

    for (const [recruitId, recruit] of teamRecruits) {
      targets.push({
        key: `recruit:${recruitId}`,
        scope: "recruit",
        teamId,
        sourceAffiliateId: recruitId,
        label: recruit.name,
        sublabel: `${plural(recruit.entryCount, "sale")} · ${recruit.sourceRevenue > 0 ? `$${recruit.sourceRevenue.toFixed(2)} of sales` : "no sale value recorded"}`,
        amount: recruit.amount,
        entryCount: recruit.entryCount,
        sourceRevenue: recruit.sourceRevenue,
        parentKey: teamKey,
      });
    }
  }

  if (direct.entryCount > 0) {
    targets.push({
      key: "direct",
      scope: "direct",
      label: "Direct sales",
      sublabel: `This affiliate's own commissions · ${plural(direct.entryCount, "sale")}`,
      amount: direct.amount,
      entryCount: direct.entryCount,
      sourceRevenue: direct.sourceRevenue,
    });
  }

  const teamTotal = Array.from(teams.values()).reduce(
    (sum, t) => sum + t.amount,
    0
  );
  const teamEntries = Array.from(teams.values()).reduce(
    (sum, t) => sum + t.entryCount,
    0
  );

  if (direct.entryCount > 0 && teamEntries > 0) {
    targets.push({
      key: "all",
      scope: "all",
      label: "Everything unpaid",
      sublabel: `Team bonuses and direct sales together · ${plural(direct.entryCount + teamEntries, "entry", "entries")}`,
      amount: direct.amount + teamTotal,
      entryCount: direct.entryCount + teamEntries,
      sourceRevenue: direct.sourceRevenue,
    });
  }

  return { targets };
}
