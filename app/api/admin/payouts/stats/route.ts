import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getPayoutAdminStats } from "@/lib/payouts/admin-stats";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const stats = await getPayoutAdminStats();
  return NextResponse.json(stats);
}
