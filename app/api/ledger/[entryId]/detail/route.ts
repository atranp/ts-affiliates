import { NextResponse } from "next/server";
import { getCommissionDetailForEntry } from "@/lib/ledger/commission-detail";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockCommissionDetailResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

const DETAIL_CACHE = "private, max-age=3600";

export async function GET(
  _request: Request,
  { params }: { params: { entryId: string } }
) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const affiliateId = auth.user.affiliateId;
  if (!affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const entryId = params.entryId;

  const detail = isAffiliateMockMode()
    ? mockCommissionDetailResponse(entryId)
    : await getCommissionDetailForEntry(entryId, affiliateId);

  if (!detail) {
    return NextResponse.json({ error: "Commission not found" }, { status: 404 });
  }

  return NextResponse.json(detail, {
    headers: { "Cache-Control": DETAIL_CACHE },
  });
}
