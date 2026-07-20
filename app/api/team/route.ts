import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getAffiliateTeam } from "@/lib/admin/team";

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

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
