import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import { getMilestoneProgress } from "../milestone";
import { buildPayoutEntryWhere } from "../payouts/scope";
import type { PayoutRecruitLine, PayoutScope } from "../payouts/types";
import { prisma } from "../prisma";
import { toNumber } from "../utils";

export type TeamRuleSummary = {
  id: string;
  name: string;
  ratePercent: string;
  milestoneRevenueThreshold: string | null;
  active: boolean;
  recruit: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
};

export type TeamMemberSummary = {
  id: string;
  displayName: string | null;
  email: string;
  status: string;
  slicewpId: number;
  rules: TeamRuleSummary[];
  stats: {
    totalRevenue: number;
    unpaidTeamBonus: number;
    pendingTeamBonus: number;
    paidTeamBonus: number;
    milestone: {
      current: number;
      threshold: number | null;
      met: boolean;
      remaining: number;
    } | null;
  };
};

export type TeamSummary = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  sponsorAffiliateId: string;
  memberCount: number;
  ruleCount: number;
  stats: {
    totalRevenue: number;
    unpaidTeamBonus: number;
    pendingTeamBonus: number;
    paidTeamBonus: number;
  };
};

export type TeamDetail = TeamSummary & {
  members: TeamMemberSummary[];
  rules: TeamRuleSummary[];
};

async function buildMemberStats(
  sponsorAffiliateId: string,
  memberIds: string[],
  rulesByRecruit: Map<string, TeamRuleSummary[]>,
  period?: { from: Date; to: Date }
): Promise<Map<string, TeamMemberSummary["stats"]>> {
  const statsMap = new Map<string, TeamMemberSummary["stats"]>();
  if (memberIds.length === 0) return statsMap;

  const commissionWhere: Prisma.CommissionWhereInput = {
    affiliateId: { in: memberIds },
    orderRevenue: { not: null },
    ...(period
      ? { createdAt: { gte: period.from, lte: period.to } }
      : {}),
  };

  const revenueByAffiliate = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: commissionWhere,
    _sum: { orderRevenue: true },
  });

  const bonusWhere: Prisma.LedgerEntryWhereInput = {
    affiliateId: sponsorAffiliateId,
    sourceAffiliateId: { in: memberIds },
    type: LedgerEntryType.OVERRIDE,
    ...(period
      ? { createdAt: { gte: period.from, lte: period.to } }
      : {}),
  };

  const bonusEntries = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId", "status"],
    where: bonusWhere,
    _sum: { amount: true },
  });

  const revenueMap = new Map(
    revenueByAffiliate.map((row) => [
      row.affiliateId,
      toNumber(row._sum.orderRevenue),
    ])
  );

  const bonusMap = new Map<
    string,
    { unpaid: number; pending: number; paid: number }
  >();

  for (const row of bonusEntries) {
    if (!row.sourceAffiliateId) continue;
    const existing = bonusMap.get(row.sourceAffiliateId) ?? {
      unpaid: 0,
      pending: 0,
      paid: 0,
    };
    const amount = toNumber(row._sum.amount);
    if (row.status === CommissionStatus.UNPAID) existing.unpaid += amount;
    else if (row.status === CommissionStatus.PENDING) existing.pending += amount;
    else if (row.status === CommissionStatus.PAID) existing.paid += amount;
    bonusMap.set(row.sourceAffiliateId, existing);
  }

  for (const memberId of memberIds) {
    const revenue = revenueMap.get(memberId) ?? 0;
    const bonuses = bonusMap.get(memberId) ?? { unpaid: 0, pending: 0, paid: 0 };
    const recruitRules = rulesByRecruit.get(memberId) ?? [];
    const thresholdRule = recruitRules.find((r) => r.milestoneRevenueThreshold);
    const threshold = thresholdRule?.milestoneRevenueThreshold
      ? toNumber(thresholdRule.milestoneRevenueThreshold)
      : null;
    const milestoneProgress = getMilestoneProgress(revenue, threshold);

    statsMap.set(memberId, {
      totalRevenue: revenue,
      unpaidTeamBonus: bonuses.unpaid,
      pendingTeamBonus: bonuses.pending,
      paidTeamBonus: bonuses.paid,
      milestone: milestoneProgress
        ? {
            current: milestoneProgress.current,
            threshold: milestoneProgress.threshold,
            met: milestoneProgress.met,
            remaining: milestoneProgress.remaining,
          }
        : null,
    });
  }

  return statsMap;
}

function mapRule(rule: {
  id: string;
  name: string;
  ratePercent: { toString(): string };
  milestoneRevenueThreshold: { toString(): string } | null;
  active: boolean;
  sourceAffiliate: {
    id: string;
    displayName: string | null;
    email: string;
  } | null;
}): TeamRuleSummary {
  return {
    id: rule.id,
    name: rule.name,
    ratePercent: rule.ratePercent.toString(),
    milestoneRevenueThreshold:
      rule.milestoneRevenueThreshold?.toString() ?? null,
    active: rule.active,
    recruit: rule.sourceAffiliate
      ? {
          id: rule.sourceAffiliate.id,
          displayName: rule.sourceAffiliate.displayName,
          email: rule.sourceAffiliate.email,
        }
      : null,
  };
}

export async function getTeamsForSponsor(
  sponsorAffiliateId: string,
  period?: { from: Date; to: Date }
): Promise<TeamSummary[]> {
  const teams = await prisma.team.findMany({
    where: { sponsorAffiliateId },
    orderBy: { name: "asc" },
    include: {
      dealRules: {
        where: { sourceAffiliateId: { not: null } },
        select: { sourceAffiliateId: true },
      },
    },
  });

  const summaries: TeamSummary[] = [];

  for (const team of teams) {
    const memberIds = Array.from(
      new Set(
        team.dealRules
          .map((rule) => rule.sourceAffiliateId)
          .filter((id): id is string => !!id)
      )
    );

    const rules = await prisma.dealRule.findMany({
      where: { teamId: team.id, sourceAffiliateId: { not: null } },
      include: {
        sourceAffiliate: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    const rulesByRecruit = new Map<string, TeamRuleSummary[]>();
    for (const rule of rules) {
      if (!rule.sourceAffiliate) continue;
      const mapped = mapRule(rule);
      const existing = rulesByRecruit.get(rule.sourceAffiliate.id) ?? [];
      existing.push(mapped);
      rulesByRecruit.set(rule.sourceAffiliate.id, existing);
    }

    const memberStats = await buildMemberStats(
      sponsorAffiliateId,
      memberIds,
      rulesByRecruit,
      period
    );

    let totalRevenue = 0;
    let unpaidTeamBonus = 0;
    let pendingTeamBonus = 0;
    let paidTeamBonus = 0;

    for (const stats of Array.from(memberStats.values())) {
      totalRevenue += stats.totalRevenue;
      unpaidTeamBonus += stats.unpaidTeamBonus;
      pendingTeamBonus += stats.pendingTeamBonus;
      paidTeamBonus += stats.paidTeamBonus;
    }

    summaries.push({
      id: team.id,
      name: team.name,
      description: team.description,
      active: team.active,
      sponsorAffiliateId: team.sponsorAffiliateId,
      memberCount: memberIds.length,
      ruleCount: rules.length,
      stats: {
        totalRevenue,
        unpaidTeamBonus,
        pendingTeamBonus,
        paidTeamBonus,
      },
    });
  }

  return summaries;
}

export async function getTeamDetail(
  teamId: string,
  sponsorAffiliateId?: string
): Promise<TeamDetail | null> {
  const team = await prisma.team.findFirst({
    where: {
      id: teamId,
      ...(sponsorAffiliateId ? { sponsorAffiliateId } : {}),
    },
  });

  if (!team) return null;

  const rules = await prisma.dealRule.findMany({
    where: { teamId: team.id },
    include: {
      sourceAffiliate: {
        select: {
          id: true,
          email: true,
          displayName: true,
          status: true,
          slicewpId: true,
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const mappedRules = rules.map(mapRule);
  const rulesByRecruit = new Map<string, TeamRuleSummary[]>();
  const memberMeta = new Map<
    string,
    {
      id: string;
      displayName: string | null;
      email: string;
      status: string;
      slicewpId: number;
    }
  >();

  for (const rule of rules) {
    if (!rule.sourceAffiliate) continue;
    const recruit = rule.sourceAffiliate;
    memberMeta.set(recruit.id, recruit);
    const mapped = mapRule(rule);
    const existing = rulesByRecruit.get(recruit.id) ?? [];
    existing.push(mapped);
    rulesByRecruit.set(recruit.id, existing);
  }

  const memberIds = Array.from(memberMeta.keys());
  const memberStats = await buildMemberStats(
    team.sponsorAffiliateId,
    memberIds,
    rulesByRecruit
  );

  const members: TeamMemberSummary[] = memberIds
    .map((id) => {
      const meta = memberMeta.get(id)!;
      return {
        id: meta.id,
        displayName: meta.displayName,
        email: meta.email,
        status: meta.status,
        slicewpId: meta.slicewpId,
        rules: rulesByRecruit.get(id) ?? [],
        stats: memberStats.get(id) ?? {
          totalRevenue: 0,
          unpaidTeamBonus: 0,
          pendingTeamBonus: 0,
          paidTeamBonus: 0,
          milestone: null,
        },
      };
    })
    .sort((a, b) =>
      (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
    );

  let totalRevenue = 0;
  let unpaidTeamBonus = 0;
  let pendingTeamBonus = 0;
  let paidTeamBonus = 0;

  for (const member of members) {
    totalRevenue += member.stats.totalRevenue;
    unpaidTeamBonus += member.stats.unpaidTeamBonus;
    pendingTeamBonus += member.stats.pendingTeamBonus;
    paidTeamBonus += member.stats.paidTeamBonus;
  }

  return {
    id: team.id,
    name: team.name,
    description: team.description,
    active: team.active,
    sponsorAffiliateId: team.sponsorAffiliateId,
    memberCount: members.length,
    ruleCount: mappedRules.length,
    stats: {
      totalRevenue,
      unpaidTeamBonus,
      pendingTeamBonus,
      paidTeamBonus,
    },
    members,
    rules: mappedRules,
  };
}

export type PayoutPreviewLine = {
  affiliateId: string;
  displayName: string | null;
  email: string;
  directTotal: number;
  directCount: number;
  overrideTotal: number;
  overrideCount: number;
  total: number;
  entryCount: number;
};

export type PayoutPreview = {
  payoutWeek: string;
  teamId: string | null;
  teamName: string | null;
  sponsorAffiliateId: string | null;
  scope: PayoutScope;
  lines: PayoutPreviewLine[];
  recruitBreakdown: PayoutRecruitLine[];
  totals: {
    directTotal: number;
    overrideTotal: number;
    grandTotal: number;
    entryCount: number;
    affiliateCount: number;
  };
};

export async function getPayoutPreview(options: {
  payoutWeek: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  scope?: PayoutScope;
}): Promise<PayoutPreview> {
  const team = options.teamId
    ? await prisma.team.findUnique({
        where: { id: options.teamId },
        select: { id: true, name: true, sponsorAffiliateId: true },
      })
    : null;

  const sponsorAffiliateId =
    team?.sponsorAffiliateId ?? options.sponsorAffiliateId;

  const scope: PayoutScope =
    options.scope ?? (options.teamId ? "team" : "all");

  const where = buildPayoutEntryWhere({
    payoutWeek: options.payoutWeek,
    teamId: options.teamId,
    sponsorAffiliateId,
    scope,
  });

  const entries = await prisma.ledgerEntry.findMany({
    where,
    include: {
      affiliate: {
        select: { id: true, email: true, displayName: true },
      },
      sourceAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
    },
  });

  const lineMap = new Map<string, PayoutPreviewLine>();

  for (const entry of entries) {
    const current = lineMap.get(entry.affiliateId) ?? {
      affiliateId: entry.affiliateId,
      displayName: entry.affiliate.displayName,
      email: entry.affiliate.email,
      directTotal: 0,
      directCount: 0,
      overrideTotal: 0,
      overrideCount: 0,
      total: 0,
      entryCount: 0,
    };

    const amount = toNumber(entry.amount);
    if (entry.type === LedgerEntryType.DIRECT) {
      current.directTotal += amount;
      current.directCount += 1;
    } else if (entry.type === LedgerEntryType.OVERRIDE) {
      current.overrideTotal += amount;
      current.overrideCount += 1;
    }
    current.total += amount;
    current.entryCount += 1;
    lineMap.set(entry.affiliateId, current);
  }

  const lines = Array.from(lineMap.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );

  let directTotal = 0;
  let overrideTotal = 0;
  let entryCount = 0;

  for (const line of lines) {
    directTotal += line.directTotal;
    overrideTotal += line.overrideTotal;
    entryCount += line.entryCount;
  }

  const recruitMap = new Map<string, PayoutRecruitLine>();
  for (const entry of entries) {
    if (entry.type !== LedgerEntryType.OVERRIDE || !entry.sourceAffiliate) continue;
    const id = entry.sourceAffiliate.id;
    const current = recruitMap.get(id) ?? {
      sourceAffiliateId: id,
      displayName: entry.sourceAffiliate.displayName,
      email: entry.sourceAffiliate.email,
      overrideTotal: 0,
      overrideCount: 0,
    };
    current.overrideTotal += toNumber(entry.amount);
    current.overrideCount += 1;
    recruitMap.set(id, current);
  }

  const recruitBreakdown = Array.from(recruitMap.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );

  return {
    payoutWeek: options.payoutWeek.toISOString(),
    teamId: team?.id ?? options.teamId ?? null,
    teamName: team?.name ?? null,
    sponsorAffiliateId: sponsorAffiliateId ?? null,
    scope,
    lines,
    recruitBreakdown,
    totals: {
      directTotal,
      overrideTotal,
      grandTotal: directTotal + overrideTotal,
      entryCount,
      affiliateCount: lines.length,
    },
  };
}

export async function listPayoutBatches(limit = 20) {
  return prisma.payoutBatch.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      team: { select: { id: true, name: true } },
      items: {
        include: {
          affiliate: {
            select: { id: true, displayName: true, email: true },
          },
        },
      },
      _count: { select: { ledgerEntries: true } },
    },
  });
}
