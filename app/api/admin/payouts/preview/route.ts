import { NextResponse } from "next/server";
import { startOfDay } from "date-fns";
import { requireAdmin } from "@/lib/api-auth";
import { getPayoutPreview } from "@/lib/teams/queries";

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const payoutWeekParam = searchParams.get("payoutWeek");
  const teamId = searchParams.get("teamId") ?? undefined;
  const sponsorAffiliateId =
    searchParams.get("sponsorAffiliateId") ?? undefined;

  const payoutWeek = payoutWeekParam
    ? startOfDay(new Date(payoutWeekParam))
    : startOfDay(new Date());

  const preview = await getPayoutPreview({
    payoutWeek,
    teamId,
    sponsorAffiliateId,
  });

  return NextResponse.json(preview);
}
