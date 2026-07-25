import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { prisma } from "@/lib/prisma";
import { getTeamsForSponsor } from "@/lib/teams/queries";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sponsorAffiliateId = searchParams.get("sponsorAffiliateId");

  if (sponsorAffiliateId) {
    const teams = await getTeamsForSponsor(sponsorAffiliateId);
    return jsonCached({ teams });
  }

  const teams = await prisma.team.findMany({
    orderBy: { name: "asc" },
    include: {
      sponsorAffiliate: {
        select: { id: true, displayName: true, email: true },
      },
      _count: { select: { dealRules: true } },
    },
  });

  return jsonCached({
    teams: teams.map((team) => ({
      id: team.id,
      name: team.name,
      description: team.description,
      active: team.active,
      sponsorAffiliateId: team.sponsorAffiliateId,
      sponsorAffiliate: team.sponsorAffiliate,
      ruleCount: team._count.dealRules,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const body = await request.json();
  const { name, description, sponsorAffiliateId, active } = body as {
    name: string;
    description?: string;
    sponsorAffiliateId: string;
    active?: boolean;
  };

  if (!name?.trim() || !sponsorAffiliateId) {
    return NextResponse.json(
      { error: "Name and sponsor affiliate are required" },
      { status: 400 }
    );
  }

  const sponsor = await prisma.affiliate.findUnique({
    where: { id: sponsorAffiliateId },
    select: { id: true },
  });

  if (!sponsor) {
    return NextResponse.json({ error: "Sponsor not found" }, { status: 404 });
  }

  const team = await prisma.team.create({
    data: {
      name: name.trim(),
      description: description?.trim() || null,
      sponsorAffiliateId,
      active: active ?? true,
    },
  });

  return NextResponse.json(team, { status: 201 });
}
