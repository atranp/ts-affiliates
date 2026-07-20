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
  };

  if (!name || !sponsorAffiliateId || !ratePercent || !basis || !type) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const rule = await prisma.dealRule.create({
    data: {
      name,
      type,
      sponsorAffiliateId,
      sourceAffiliateId: sourceAffiliateId || null,
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
    },
  });

  const overridesCreated =
    rule.sourceAffiliateId && rule.active
      ? await applyDealRuleRetroactively(rule.id)
      : 0;

  return NextResponse.json({ ...rule, overridesCreated }, { status: 201 });
}
