import { NextResponse } from "next/server";
import { getAffiliateVisits } from "@/lib/affiliate/reach";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockAffiliateVisits } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

/** Referral link clicks, with a 30-day trend and a paginated recent list. */
export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get("page") ?? "1");
  const pageSize = Number(searchParams.get("limit") ?? "50");

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockAffiliateVisits(page));
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  return NextResponse.json(
    await getAffiliateVisits(affiliateId, {
      page: Number.isFinite(page) ? page : 1,
      pageSize: Number.isFinite(pageSize) ? pageSize : 50,
    })
  );
}
