import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { getPayoutBatchDetail } from "@/lib/payouts/queries";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

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
