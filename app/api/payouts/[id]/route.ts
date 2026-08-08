import { NextResponse } from "next/server";
import { getPayoutBatchDetail } from "@/lib/payouts/queries";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockPayoutDetailResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  if (isAffiliateMockMode()) {
    const detail = mockPayoutDetailResponse(params.id);
    if (!detail) {
      return NextResponse.json({ error: "Payout not found" }, { status: 404 });
    }
    return NextResponse.json(detail);
  }

  if (!auth.user.affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const batch = await getPayoutBatchDetail(params.id, {
    affiliateId: auth.user.affiliateId,
  });

  if (!batch) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
