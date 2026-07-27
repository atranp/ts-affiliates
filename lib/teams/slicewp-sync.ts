import { prisma } from "@/lib/prisma";
import { SLICEWP_DOWNLINE_KEY } from "./constants";
import { ensureSponsorDownlineTeam } from "./members";

/** Create/update one downline Team per sponsor that has SliceWP recruits. */
export async function syncTeamsFromSliceWP(): Promise<number> {
  const parentIds = await prisma.affiliate.groupBy({
    by: ["parentAffiliateId"],
    where: { parentAffiliateId: { not: null } },
  });

  let count = 0;
  for (const row of parentIds) {
    if (!row.parentAffiliateId) continue;
    await ensureSponsorDownlineTeam(row.parentAffiliateId);
    count += 1;
  }

  return count;
}

/** Attach team-wide rules without a team to the sponsor's downline team. */
export async function linkOrphanRulesToDownlineTeams(): Promise<number> {
  const sponsors = await prisma.dealRule.findMany({
    where: {
      teamId: null,
      sourceAffiliateId: null,
      active: true,
    },
    select: { sponsorAffiliateId: true },
    distinct: ["sponsorAffiliateId"],
  });

  let linked = 0;
  for (const row of sponsors) {
    const team = await prisma.team.findUnique({
      where: {
        sponsorAffiliateId_slicewpKey: {
          sponsorAffiliateId: row.sponsorAffiliateId,
          slicewpKey: SLICEWP_DOWNLINE_KEY,
        },
      },
      select: { id: true },
    });
    if (!team) continue;

    const result = await prisma.dealRule.updateMany({
      where: {
        sponsorAffiliateId: row.sponsorAffiliateId,
        teamId: null,
        sourceAffiliateId: null,
      },
      data: { teamId: team.id },
    });
    linked += result.count;
  }

  return linked;
}
