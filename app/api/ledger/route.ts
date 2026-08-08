import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { NextResponse } from "next/server";
import { jsonCached } from "@/lib/api-cache";
import { getLedgerResponse } from "@/lib/ledger/queries";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockLedgerResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";
import {
  resolveLedgerSortDir,
  resolveLedgerSortKey,
} from "@/lib/ledger/sort";

const VALID_STATUSES = new Set<string>(Object.values(CommissionStatus));
const VALID_TYPES = new Set<string>(Object.values(LedgerEntryType));

export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");
  const sourceAffiliateId = searchParams.get("sourceAffiliateId") ?? undefined;
  const teamId = searchParams.get("teamId") ?? undefined;
  const q = searchParams.get("q") ?? undefined;
  const page = Number(searchParams.get("page") ?? "1");
  const limit = Number(searchParams.get("limit") ?? "50");
  const sortBy = resolveLedgerSortKey(searchParams.get("sort"));
  const sortDir = resolveLedgerSortDir(searchParams.get("dir"), sortBy);

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

  if (isAffiliateMockMode()) {
    return jsonCached(
      mockLedgerResponse({
        status,
        type,
        sourceAffiliateId,
        q,
        page,
        limit,
        sortBy,
        sortDir,
      })
    );
  }

  const data = await getLedgerResponse({
    affiliateId,
    status,
    type,
    sourceAffiliateId,
    teamId,
    q,
    page,
    limit,
    sortBy,
    sortDir,
  });

  return jsonCached(data);
}
