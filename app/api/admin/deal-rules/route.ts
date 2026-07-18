import { DealBasis, DealRuleType, PayoutSchedule } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { prisma } from "@/lib/prisma";

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

  return NextResponse.json(rules);
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
  } = body as {
    name: string;
    type: DealRuleType;
    sponsorAffiliateId: string;
    sourceAffiliateId?: string;
    ratePercent: number;
    basis: DealBasis;
    schedule?: PayoutSchedule;
    active?: boolean;
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

  return NextResponse.json(rule, { status: 201 });
}
