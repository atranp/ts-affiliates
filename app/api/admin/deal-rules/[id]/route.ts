import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";
import {
  applyDealRuleRetroactively,
  deleteNonPaidOverridesForRule,
} from "@/lib/rules-engine";

type RouteContext = { params: Promise<{ id: string }> };

const ruleInclude = {
  sponsorAffiliate: {
    select: { id: true, email: true, displayName: true },
  },
  sourceAffiliate: {
    select: { id: true, email: true, displayName: true },
  },
  team: { select: { id: true, name: true } },
} as const;

function parseMilestone(value: unknown): number | null {
  if (value == null || value === "") return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

export async function PATCH(request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const existing = await prisma.dealRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const body = await request.json();
  const {
    name,
    sponsorAffiliateId,
    sourceAffiliateId,
    ratePercent,
    milestoneRevenueThreshold,
    active,
    teamId,
  } = body as {
    name?: string;
    sponsorAffiliateId?: string;
    sourceAffiliateId?: string | null;
    ratePercent?: number;
    milestoneRevenueThreshold?: number | null;
    active?: boolean;
    teamId?: string | null;
  };

  const nextSponsorId = sponsorAffiliateId ?? existing.sponsorAffiliateId;
  const nextSourceId =
    sourceAffiliateId !== undefined
      ? sourceAffiliateId || null
      : existing.sourceAffiliateId;

  if (nextSourceId && nextSponsorId === nextSourceId) {
    return NextResponse.json(
      { error: "Sponsor and recruit must be different affiliates" },
      { status: 400 }
    );
  }

  if (ratePercent != null && ratePercent <= 0) {
    return NextResponse.json(
      { error: "Rate must be greater than zero" },
      { status: 400 }
    );
  }

  const nextTeamId =
    teamId !== undefined ? teamId || null : existing.teamId;

  if (nextTeamId) {
    const team = await prisma.team.findFirst({
      where: { id: nextTeamId, sponsorAffiliateId: nextSponsorId },
    });
    if (!team) {
      return NextResponse.json(
        { error: "Team not found for this sponsor" },
        { status: 400 }
      );
    }
  }

  if (!nextSourceId && !nextTeamId) {
    return NextResponse.json(
      { error: "Select a recruit or a team for team-wide rules" },
      { status: 400 }
    );
  }

  const affiliateChanged =
    nextSponsorId !== existing.sponsorAffiliateId ||
    nextSourceId !== existing.sourceAffiliateId ||
    nextTeamId !== existing.teamId;

  const reactivated = active === true && !existing.active;

  let overridesRemoved = 0;
  if (affiliateChanged || reactivated) {
    overridesRemoved = await deleteNonPaidOverridesForRule(id);
  }

  const rule = await prisma.dealRule.update({
    where: { id },
    data: {
      ...(name != null ? { name } : {}),
      sponsorAffiliateId: nextSponsorId,
      sourceAffiliateId: nextSourceId,
      ...(ratePercent != null ? { ratePercent } : {}),
      ...(milestoneRevenueThreshold !== undefined
        ? { milestoneRevenueThreshold: parseMilestone(milestoneRevenueThreshold) }
        : {}),
      ...(active !== undefined ? { active } : {}),
      ...(teamId !== undefined ? { teamId: nextTeamId } : {}),
    },
    include: ruleInclude,
  });

  let overridesUpdated = 0;
  if (rule.active && (rule.sourceAffiliateId || rule.teamId)) {
    overridesUpdated = await applyDealRuleRetroactively(rule.id);
  }

  return NextResponse.json({
    ...rule,
    overridesRemoved,
    overridesUpdated,
  });
}

export async function DELETE(_request: Request, context: RouteContext) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { id } = await context.params;
  const existing = await prisma.dealRule.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Rule not found" }, { status: 404 });
  }

  const overridesRemoved = await deleteNonPaidOverridesForRule(id);
  await prisma.dealRule.delete({ where: { id } });

  return NextResponse.json({ ok: true, overridesRemoved });
}
