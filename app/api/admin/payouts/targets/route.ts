import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { resolvePayoutPeriodFromRequest } from "@/lib/payouts/parse-period";
import { getPayoutTargets } from "@/lib/payouts/targets";
import type { PayoutDateBasis } from "@/lib/payouts/types";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const sponsorAffiliateId = searchParams.get("sponsorAffiliateId");

  if (!sponsorAffiliateId) {
    return NextResponse.json(
      { error: "sponsorAffiliateId is required" },
      { status: 400 }
    );
  }

  const dateBasis: PayoutDateBasis =
    searchParams.get("dateBasis") === "sale_date" ? "sale_date" : "payout_week";

  try {
    const { periodStart, periodEnd } = resolvePayoutPeriodFromRequest({
      periodStart: searchParams.get("periodStart"),
      periodEnd: searchParams.get("periodEnd"),
    });

    const result = await getPayoutTargets({
      sponsorAffiliateId,
      periodStart,
      periodEnd,
      dateBasis,
    });

    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid date range" },
      { status: 400 }
    );
  }
}
