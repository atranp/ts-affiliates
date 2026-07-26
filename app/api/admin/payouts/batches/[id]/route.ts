import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getPayoutBatchDetail } from "@/lib/payouts/queries";

export async function GET(
  _request: Request,
  { params }: { params: { id: string } }
) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const batch = await getPayoutBatchDetail(params.id);
  if (!batch) {
    return NextResponse.json({ error: "Payout not found" }, { status: 404 });
  }

  return NextResponse.json({ batch });
}
