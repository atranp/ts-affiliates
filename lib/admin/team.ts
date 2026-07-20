import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { prisma } from "../prisma";
import {
  getMilestoneProgress,
  getRecruitCumulativeRevenue,
} from "../milestone";
import { toNumber } from "../utils";

export type TeamMemberStats = {
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

export type TeamMember = {
  id: string;
  displayName: string | null;
  email: string;
  status: string;
  slicewpId: number;
  sources: Array<"deal_rule" | "parent_link">;
  dealRule: {
    id: string;
    name: string;
    ratePercent: string;
    milestoneRevenueThreshold: string | null;
  } | null;
  stats: TeamMemberStats;
};

export async function getAffiliateTeam(
  sponsorAffiliateId: string
): Promise<TeamMember[]> {
  const [dealRules, childAffiliates] = [
    await prisma.dealRule.findMany({
      where: {
        sponsorAffiliateId,
        active: true,
        sourceAffiliateId: { not: null },
      },
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
    }),
    await prisma.affiliate.findMany({
      where: { parentAffiliateId: sponsorAffiliateId },
      select: {
        id: true,
        email: true,
        displayName: true,
        status: true,
        slicewpId: true,
      },
    }),
  ];

  const memberMap = new Map<string, TeamMember>();

  for (const rule of dealRules) {
    if (!rule.sourceAffiliate) continue;
    const affiliate = rule.sourceAffiliate;
    memberMap.set(affiliate.id, {
      id: affiliate.id,
      displayName: affiliate.displayName,
      email: affiliate.email,
      status: affiliate.status,
      slicewpId: affiliate.slicewpId,
      sources: ["deal_rule"],
      dealRule: {
        id: rule.id,
        name: rule.name,
        ratePercent: rule.ratePercent.toString(),
        milestoneRevenueThreshold:
          rule.milestoneRevenueThreshold?.toString() ?? null,
      },
      stats: {
        totalRevenue: 0,
        unpaidTeamBonus: 0,
        pendingTeamBonus: 0,
        paidTeamBonus: 0,
        milestone: null,
      },
    });
  }

  for (const child of childAffiliates) {
    const existing = memberMap.get(child.id);
    if (existing) {
      if (!existing.sources.includes("parent_link")) {
        existing.sources.push("parent_link");
      }
      continue;
    }
    memberMap.set(child.id, {
      id: child.id,
      displayName: child.displayName,
      email: child.email,
      status: child.status,
      slicewpId: child.slicewpId,
      sources: ["parent_link"],
      dealRule: null,
      stats: {
        totalRevenue: 0,
        unpaidTeamBonus: 0,
        pendingTeamBonus: 0,
        paidTeamBonus: 0,
        milestone: null,
      },
    });
  }

  const memberIds = Array.from(memberMap.keys());
  if (memberIds.length === 0) return [];

  const revenueByAffiliate = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: {
      affiliateId: { in: memberIds },
      orderRevenue: { not: null },
    },
    _sum: { orderRevenue: true },
  });

  const bonusEntries = await prisma.ledgerEntry.groupBy({
    by: ["sourceAffiliateId", "status"],
    where: {
      affiliateId: sponsorAffiliateId,
      sourceAffiliateId: { in: memberIds },
      type: LedgerEntryType.OVERRIDE,
    },
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

  for (const [id, member] of Array.from(memberMap.entries())) {
    const revenue = revenueMap.get(id) ?? 0;
    const bonuses = bonusMap.get(id) ?? { unpaid: 0, pending: 0, paid: 0 };
    const threshold = member.dealRule?.milestoneRevenueThreshold
      ? toNumber(member.dealRule.milestoneRevenueThreshold)
      : null;
    const milestoneProgress = getMilestoneProgress(revenue, threshold);

    member.stats = {
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
    };
  }

  return Array.from(memberMap.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );
}

/** Batch revenue lookup for rules engine during sync. */
export async function getRecruitRevenueMap(
  sourceAffiliateIds: string[]
): Promise<Map<string, number>> {
  if (sourceAffiliateIds.length === 0) return new Map();

  const rows = await prisma.commission.groupBy({
    by: ["affiliateId"],
    where: {
      affiliateId: { in: sourceAffiliateIds },
      orderRevenue: { not: null },
    },
    _sum: { orderRevenue: true },
  });

  return new Map(
    rows.map((row) => [row.affiliateId, toNumber(row._sum.orderRevenue)])
  );
}

export async function enrichTeamMemberRevenue(
  sourceAffiliateId: string
): Promise<number> {
  return getRecruitCumulativeRevenue(sourceAffiliateId);
}
