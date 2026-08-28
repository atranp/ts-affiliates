import { NextResponse } from "next/server";
import { getActiveCreatives, getAffiliateLink } from "@/lib/affiliate/reach";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockAffiliateCreatives } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

/**
 * Marketing assets, plus the affiliate's referral link so the UI can show the
 * ready-to-paste embed for each one without a second request.
 */
export async function GET() {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockAffiliateCreatives());
  }

  const { affiliateId } = auth.user;
  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  const [creatives, link] = await Promise.all([
    getActiveCreatives(),
    getAffiliateLink(affiliateId),
  ]);

  return NextResponse.json({ creatives, referralUrl: link.referralUrl });
}
