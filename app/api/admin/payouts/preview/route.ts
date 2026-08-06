import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { resolvePayoutPeriodFromRequest } from "@/lib/payouts/parse-period";
import { getPayoutPreview } from "@/lib/teams/queries";
import type { PayoutScope } from "@/lib/payouts/types";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const teamId = searchParams.get("teamId") ?? undefined;
  const sponsorAffiliateId =
    searchParams.get("sponsorAffiliateId") ?? undefined;
  const sourceAffiliateId =
    searchParams.get("sourceAffiliateId") ?? undefined;
  const scope = (searchParams.get("scope") as PayoutScope | null) ?? undefined;

  try {
    const { periodStart, periodEnd } = resolvePayoutPeriodFromRequest({
      periodStart: searchParams.get("periodStart"),
      periodEnd: searchParams.get("periodEnd"),
      payoutWeek: searchParams.get("payoutWeek"),
    });

    const preview = await getPayoutPreview({
      periodStart,
      periodEnd,
      teamId,
      sponsorAffiliateId,
      sourceAffiliateId,
      scope,
    });

    return NextResponse.json(preview);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Invalid date range" },
      { status: 400 }
    );
  }
}
