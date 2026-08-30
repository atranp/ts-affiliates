import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import { getAffiliatePerformance } from "@/lib/affiliate/performance";
import { periodFromParams } from "@/lib/affiliate/period";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockAffiliatePerformance } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

/**
 * Headline numbers and trend series for a date window, alongside the same
 * figures for the window before it so the dashboard can show movement.
 */
export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const period = periodFromParams(searchParams, { fallback: "last-30" });

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockAffiliatePerformance(period));
  }

  let affiliateId = auth.user.affiliateId;
  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    affiliateId = searchParams.get("affiliateId");
  }

  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  const data = await getAffiliatePerformance(
    affiliateId,
    period.range,
    period.previous
  );

  return jsonCached({
    ...data,
    period: {
      key: period.key,
      label: period.label,
      comparisonLabel: period.comparisonLabel,
    },
  });
}
