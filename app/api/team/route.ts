import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import { getAffiliateTeam } from "@/lib/admin/team";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockLegacyTeamResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return jsonCached(mockLegacyTeamResponse());
  }

  const { searchParams } = new URL(request.url);
  let affiliateId = auth.user.affiliateId;

  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    affiliateId = searchParams.get("affiliateId");
  }

  if (!affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const team = await getAffiliateTeam(affiliateId);
  return jsonCached({ team });
}
