import { CommissionStatus, LedgerEntryType, Prisma } from "@prisma/client";
import { getMilestoneProgress } from "../milestone";
import { buildPayoutEntryWhere } from "../payouts/scope";
import type {
  PayoutDateBasis,
  PayoutPreviewEntry,
  PayoutRecruitLine,
  PayoutScope,
} from "../payouts/types";
import { prisma } from "../prisma";
import { toNumber } from "../utils";
import { ensureSponsorDownlineTeam, getTeamMembers } from "./members";

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
  slicewpKey?: string | null;
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
      ? { dateCreated: { gte: period.from, lte: period.to } }
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

function assignRulesToMembers(
  memberIds: string[],
  mappedRules: TeamRuleSummary[]
): Map<string, TeamRuleSummary[]> {
  const teamWideRules = mappedRules.filter((rule) => !rule.recruit);
  const rulesByRecruit = new Map<string, TeamRuleSummary[]>();

  for (const rule of mappedRules) {
    if (!rule.recruit) continue;
    const existing = rulesByRecruit.get(rule.recruit.id) ?? [];
    existing.push(rule);
    rulesByRecruit.set(rule.recruit.id, existing);
  }

  for (const memberId of memberIds) {
    const existing = rulesByRecruit.get(memberId) ?? [];
    rulesByRecruit.set(memberId, [...existing, ...teamWideRules]);
  }

  return rulesByRecruit;
}

export async function getTeamsForSponsor(
  sponsorAffiliateId: string,
  period?: { from: Date; to: Date }
): Promise<TeamSummary[]> {
  await ensureSponsorDownlineTeamIfNeeded(sponsorAffiliateId);

  const teams = await prisma.team.findMany({
    where: { sponsorAffiliateId },
    orderBy: { name: "asc" },
  });

  const summaries: TeamSummary[] = [];

  for (const team of teams) {
    const members = await getTeamMembers(team.id);
    const memberIds = members.map((member) => member.id);

    const rules = await prisma.dealRule.findMany({
      where: { teamId: team.id, active: true },
      include: {
        sourceAffiliate: {
          select: { id: true, displayName: true, email: true },
        },
      },
    });

    const mappedRules = rules.map(mapRule);
    const rulesByRecruit = assignRulesToMembers(memberIds, mappedRules);

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
      slicewpKey: team.slicewpKey,
      memberCount: memberIds.length,
      ruleCount: mappedRules.length,
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

async function ensureSponsorDownlineTeamIfNeeded(sponsorAffiliateId: string) {
  const recruitCount = await prisma.affiliate.count({
    where: { parentAffiliateId: sponsorAffiliateId },
  });
  if (recruitCount > 0) {
    await ensureSponsorDownlineTeam(sponsorAffiliateId);
  }
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

  const membersRaw = await getTeamMembers(team.id);

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
  const memberIds = membersRaw.map((member) => member.id);
  const rulesByRecruit = assignRulesToMembers(memberIds, mappedRules);

  const memberStats = await buildMemberStats(
    team.sponsorAffiliateId,
    memberIds,
    rulesByRecruit
  );

  const members: TeamMemberSummary[] = membersRaw
    .map((meta) => ({
      id: meta.id,
      displayName: meta.displayName,
      email: meta.email,
      status: meta.status,
      slicewpId: meta.slicewpId,
      rules: rulesByRecruit.get(meta.id) ?? [],
      stats: memberStats.get(meta.id) ?? {
        totalRevenue: 0,
        unpaidTeamBonus: 0,
        pendingTeamBonus: 0,
        paidTeamBonus: 0,
        milestone: null,
      },
    }))
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
  periodStart: string;
  periodEnd: string;
  teamId: string | null;
  teamName: string | null;
  sponsorAffiliateId: string | null;
  sourceAffiliateId: string | null;
  sourceAffiliateName: string | null;
  scope: PayoutScope;
  dateBasis: PayoutDateBasis;
  lines: PayoutPreviewLine[];
  recruitBreakdown: PayoutRecruitLine[];
  /** Most recent sales only; totals above always cover the whole selection. */
  entries: PayoutPreviewEntry[];
  entriesTruncated: boolean;
  totals: {
    directTotal: number;
    overrideTotal: number;
    grandTotal: number;
    entryCount: number;
    affiliateCount: number;
    /** Underlying sale value, so a percentage rate can be checked. */
    sourceRevenue: number;
  };
};

export const PAYOUT_PREVIEW_ENTRY_LIMIT = 100;

type PreviewEntryRow = {
  id: string;
  occurredAt: Date;
  type: LedgerEntryType;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: Prisma.Decimal | null;
  amount: Prisma.Decimal;
  affiliate: { displayName: string | null; email: string };
  sourceAffiliate: { displayName: string | null; email: string } | null;
};

function toPreviewEntries(rows: PreviewEntryRow[]): PayoutPreviewEntry[] {
  return rows
    .slice()
    .sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())
    .map((entry) => ({
      id: entry.id,
      occurredAt: entry.occurredAt.toISOString(),
      type: entry.type,
      description: entry.description,
      wooOrderId: entry.wooOrderId,
      orderRevenue:
        entry.orderRevenue == null ? null : toNumber(entry.orderRevenue),
      amount: toNumber(entry.amount),
      affiliateName: entry.affiliate.displayName ?? entry.affiliate.email,
      sourceAffiliateName: entry.sourceAffiliate
        ? (entry.sourceAffiliate.displayName ?? entry.sourceAffiliate.email)
        : null,
    }));
}

/** Every line item in a payout selection, for CSV export and reconciliation. */
export async function getPayoutPreviewEntries(options: {
  periodStart: Date;
  periodEnd: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  sourceAffiliateId?: string;
  scope?: PayoutScope;
  dateBasis?: PayoutDateBasis;
}): Promise<PayoutPreviewEntry[]> {
  const team = options.teamId
    ? await prisma.team.findUnique({
        where: { id: options.teamId },
        select: { sponsorAffiliateId: true },
      })
    : null;

  const where = buildPayoutEntryWhere({
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    teamId: options.teamId,
    sponsorAffiliateId:
      team?.sponsorAffiliateId ?? options.sponsorAffiliateId,
    sourceAffiliateId: options.sourceAffiliateId,
    scope: options.scope,
    dateBasis: options.dateBasis,
  });

  const rows = await prisma.ledgerEntry.findMany({
    where,
    include: {
      affiliate: { select: { displayName: true, email: true } },
      sourceAffiliate: { select: { displayName: true, email: true } },
    },
  });

  return toPreviewEntries(rows);
}

export async function getPayoutPreview(options: {
  periodStart: Date;
  periodEnd: Date;
  teamId?: string;
  sponsorAffiliateId?: string;
  sourceAffiliateId?: string;
  scope?: PayoutScope;
  dateBasis?: PayoutDateBasis;
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
    options.scope ??
    (options.sourceAffiliateId ? "recruit" : options.teamId ? "team" : "all");

  const dateBasis: PayoutDateBasis = options.dateBasis ?? "payout_week";

  const sourceAffiliate = options.sourceAffiliateId
    ? await prisma.affiliate.findUnique({
        where: { id: options.sourceAffiliateId },
        select: { id: true, displayName: true, email: true },
      })
    : null;

  const where = buildPayoutEntryWhere({
    periodStart: options.periodStart,
    periodEnd: options.periodEnd,
    teamId: options.teamId,
    sponsorAffiliateId,
    sourceAffiliateId: options.sourceAffiliateId,
    scope,
    dateBasis,
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
  let sourceRevenue = 0;
  for (const entry of entries) {
    if (entry.type !== LedgerEntryType.OVERRIDE || !entry.sourceAffiliate) continue;
    const id = entry.sourceAffiliate.id;
    const current = recruitMap.get(id) ?? {
      sourceAffiliateId: id,
      displayName: entry.sourceAffiliate.displayName,
      email: entry.sourceAffiliate.email,
      overrideTotal: 0,
      overrideCount: 0,
      sourceRevenue: 0,
    };
    const revenue = toNumber(entry.orderRevenue);
    current.overrideTotal += toNumber(entry.amount);
    current.overrideCount += 1;
    current.sourceRevenue += revenue;
    sourceRevenue += revenue;
    recruitMap.set(id, current);
  }

  const recruitBreakdown = Array.from(recruitMap.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );

  const previewEntries = toPreviewEntries(entries).slice(
    0,
    PAYOUT_PREVIEW_ENTRY_LIMIT
  );

  return {
    periodStart: options.periodStart.toISOString(),
    periodEnd: options.periodEnd.toISOString(),
    teamId: team?.id ?? options.teamId ?? null,
    teamName: team?.name ?? null,
    sponsorAffiliateId: sponsorAffiliateId ?? null,
    sourceAffiliateId: sourceAffiliate?.id ?? null,
    sourceAffiliateName:
      sourceAffiliate?.displayName ?? sourceAffiliate?.email ?? null,
    scope,
    dateBasis,
    lines,
    recruitBreakdown,
    entries: previewEntries,
    entriesTruncated: entries.length > PAYOUT_PREVIEW_ENTRY_LIMIT,
    totals: {
      directTotal,
      overrideTotal,
      grandTotal: directTotal + overrideTotal,
      entryCount,
      affiliateCount: lines.length,
      sourceRevenue,
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
