import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/api-auth";
import { parsePayoutCutoff, PayoutInputError } from "@/lib/payouts/create";
import { getPayoutOptions } from "@/lib/payouts/options";

/**
 * What this ambassador can be paid for, priced as of a single cutoff. The
 * cutoff is normally omitted so the server stamps "now" and every downstream
 * call reuses that exact instant.
 */
export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ("error" in auth) return auth.error;

  const params = new URL(request.url).searchParams;
  const affiliateId = params.get("affiliateId");
  if (!affiliateId) {
    return NextResponse.json(
      { error: "affiliateId is required" },
      { status: 400 }
    );
  }

  try {
    const options = await getPayoutOptions({
      affiliateId,
      cutoff: parsePayoutCutoff(params.get("cutoff")),
    });
    return NextResponse.json(options);
  } catch (error) {
    if (error instanceof PayoutInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("Payout options failed:", error);
    return NextResponse.json(
      { error: "Could not load payout options." },
      { status: 500 }
    );
  }
}
