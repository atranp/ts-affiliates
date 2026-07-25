import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getTeamsForSponsor } from "@/lib/teams/queries";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  let sponsorAffiliateId = auth.user.affiliateId;

  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    sponsorAffiliateId = searchParams.get("affiliateId");
  }

  if (!sponsorAffiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const teams = await getTeamsForSponsor(sponsorAffiliateId);
  return jsonCached({ teams });
}
