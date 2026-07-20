import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/api-auth";
import { jsonCached } from "@/lib/api-cache";
import { getLedgerResponse } from "@/lib/ledger/queries";

const VALID_STATUSES = new Set<string>(Object.values(CommissionStatus));
const VALID_TYPES = new Set<string>(Object.values(LedgerEntryType));

export async function GET(request: Request) {
  const auth = await requireAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");
  const sourceAffiliateId = searchParams.get("sourceAffiliateId") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "50");

  const status =
    statusParam && VALID_STATUSES.has(statusParam)
      ? (statusParam as CommissionStatus)
      : undefined;
  const type =
    typeParam && VALID_TYPES.has(typeParam)
      ? (typeParam as LedgerEntryType)
      : undefined;

  let affiliateId = auth.user.affiliateId;
  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    affiliateId = searchParams.get("affiliateId");
  }

  if (!affiliateId) {
    return NextResponse.json(
      { error: "No affiliate linked to this account" },
      { status: 400 }
    );
  }

  const data = await getLedgerResponse({
    affiliateId,
    status,
    type,
    sourceAffiliateId,
    page,
    limit,
  });

  return jsonCached(data);
}
