import { DealBasis, DealRuleType, PayoutSchedule } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { prisma } from "@/lib/prisma";
import { applyDealRuleRetroactively } from "@/lib/rules-engine";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const rules = await prisma.dealRule.findMany({
    include: {
      sponsorAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      sourceAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      team: { select: { id: true, name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return jsonCached(rules);
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const {
    name,
    type,
    sponsorAffiliateId,
    sourceAffiliateId,
    ratePercent,
    basis,
    schedule,
    active,
    milestoneRevenueThreshold,
    teamId,
  } = body as {
    name: string;
    type: DealRuleType;
    sponsorAffiliateId: string;
    sourceAffiliateId?: string;
    ratePercent: number;
    basis: DealBasis;
    schedule?: PayoutSchedule;
    active?: boolean;
    milestoneRevenueThreshold?: number | null;
    teamId?: string | null;
  };

  if (!name || !sponsorAffiliateId || !ratePercent || !basis || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const resolvedSourceId = sourceAffiliateId || null;
  if (!resolvedSourceId && !teamId) {
    return NextResponse.json(
      { error: "Select a recruit or a team for team-wide rules" },
      { status: 400 }
    );
  }

  if (resolvedSourceId && resolvedSourceId === sponsorAffiliateId) {
    return NextResponse.json(
      { error: "Sponsor and recruit must be different affiliates" },
      { status: 400 }
    );
  }

  if (teamId) {
    const team = await prisma.team.findFirst({
      where: { id: teamId, sponsorAffiliateId },
    });
    if (!team) {
      return NextResponse.json(
        { error: "Team not found for this sponsor" },
        { status: 400 }
      );
    }
  }

  const rule = await prisma.dealRule.create({
    data: {
      name,
      type,
      sponsorAffiliateId,
      sourceAffiliateId: resolvedSourceId,
      teamId: teamId || null,
      ratePercent,
      basis,
      milestoneRevenueThreshold:
        milestoneRevenueThreshold != null && milestoneRevenueThreshold > 0
          ? milestoneRevenueThreshold
          : null,
      schedule: schedule ?? PayoutSchedule.WEEKLY_MONDAY,
      active: active ?? true,
    },
    include: {
      sponsorAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      sourceAffiliate: {
        select: { id: true, email: true, displayName: true },
      },
      team: { select: { id: true, name: true } },
    },
  });

  const overridesCreated =
    rule.active && (rule.sourceAffiliateId || rule.teamId)
      ? await applyDealRuleRetroactively(rule.id)
      : 0;

  return NextResponse.json({ ...rule, overridesCreated }, { status: 201 });
}
