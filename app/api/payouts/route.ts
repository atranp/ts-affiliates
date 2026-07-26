import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { listPayoutBatchesForAffiliate } from "@/lib/payouts/queries";

export async function GET() {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  if (!auth.user.affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const batches = await listPayoutBatchesForAffiliate(auth.user.affiliateId, 50);
  return NextResponse.json({ batches });
}
