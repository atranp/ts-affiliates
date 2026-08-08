import { NextResponse } from "next/server";
import { listPayoutHistoryForAffiliate } from "@/lib/payouts/history";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockPayoutsResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

export async function GET() {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    return NextResponse.json(mockPayoutsResponse());
  }

  if (!auth.user.affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const batches = await listPayoutHistoryForAffiliate(auth.user.affiliateId, 50);
  return NextResponse.json({ batches });
}
