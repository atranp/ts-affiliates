import { prisma } from "@/lib/prisma";
import { SLICEWP_DOWNLINE_KEY } from "./constants";

export type TeamMemberRecord = {
  id: string;
  displayName: string | null;
  email: string;
  status: string;
  slicewpId: number;
};

export async function getTeamMemberIds(teamId: string): Promise<string[]> {
  const members = await getTeamMembers(teamId);
  return members.map((member) => member.id);
}

export async function getTeamMembers(
  teamId: string
): Promise<TeamMemberRecord[]> {
  const team = await prisma.team.findUnique({
    where: { id: teamId },
    select: { id: true, sponsorAffiliateId: true, slicewpKey: true },
  });

  if (!team) return [];

  if (team.slicewpKey === SLICEWP_DOWNLINE_KEY) {
    return prisma.affiliate.findMany({
      where: { parentAffiliateId: team.sponsorAffiliateId },
      select: {
        id: true,
        displayName: true,
        email: true,
        status: true,
        slicewpId: true,
      },
      orderBy: [{ displayName: "asc" }, { email: "asc" }],
    });
  }

  const fromRules = await prisma.dealRule.findMany({
    where: {
      teamId: team.id,
      sourceAffiliateId: { not: null },
    },
    select: {
      sourceAffiliate: {
        select: {
          id: true,
          displayName: true,
          email: true,
          status: true,
          slicewpId: true,
        },
      },
    },
  });

  const byId = new Map<string, TeamMemberRecord>();
  for (const rule of fromRules) {
    if (!rule.sourceAffiliate) continue;
    byId.set(rule.sourceAffiliate.id, rule.sourceAffiliate);
  }

  return Array.from(byId.values()).sort((a, b) =>
    (a.displayName ?? a.email).localeCompare(b.displayName ?? b.email)
  );
}

export async function isAffiliateInTeam(
  teamId: string,
  affiliateId: string
): Promise<boolean> {
  const memberIds = await getTeamMemberIds(teamId);
  return memberIds.includes(affiliateId);
}

export async function ensureSponsorDownlineTeam(
  sponsorAffiliateId: string
): Promise<{ id: string; name: string }> {
  const sponsor = await prisma.affiliate.findUnique({
    where: { id: sponsorAffiliateId },
    select: { displayName: true, email: true },
  });

  const label =
    sponsor?.displayName ?? sponsor?.email?.split("@")[0] ?? "Sponsor";
  const name = `${label}'s Downline`;

  const team = await prisma.team.upsert({
    where: {
      sponsorAffiliateId_slicewpKey: {
        sponsorAffiliateId,
        slicewpKey: SLICEWP_DOWNLINE_KEY,
      },
    },
    create: {
      name,
      description: "Synced from SliceWP parent/recruit relationships",
      sponsorAffiliateId,
      slicewpKey: SLICEWP_DOWNLINE_KEY,
      active: true,
    },
    update: {
      name,
      active: true,
    },
    select: { id: true, name: true },
  });

  return team;
}
