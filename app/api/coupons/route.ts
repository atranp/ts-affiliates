import { NextResponse } from "next/server";
import { getAffiliateCoupons } from "@/lib/affiliate/reach";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockAffiliateCoupons } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

/** Discount codes credited to this affiliate. */
export async function GET() {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return NextResponse.json({ coupons: mockAffiliateCoupons() });
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  return NextResponse.json({ coupons: await getAffiliateCoupons(affiliateId) });
}
