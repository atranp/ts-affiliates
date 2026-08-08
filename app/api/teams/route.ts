import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import { getTeamsForSponsor } from "@/lib/teams/queries";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockTeamsResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return jsonCached(mockTeamsResponse());
  }

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
