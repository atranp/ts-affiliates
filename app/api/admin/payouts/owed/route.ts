import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { getTopUnpaidAffiliates } from "@/lib/payouts/targets";

export async function GET() {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const affiliates = await getTopUnpaidAffiliates();
  return NextResponse.json({ affiliates });
}
