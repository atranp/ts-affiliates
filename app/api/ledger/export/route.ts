import { CommissionStatus, LedgerEntryType } from "@prisma/client";
import { NextResponse } from "next/server";
import { periodFromParams } from "@/lib/affiliate/period";
import type { ExportableEntry } from "@/lib/ledger/csv";
import { csvFilename, ledgerToCsv } from "@/lib/ledger/csv";
import { EXPORT_ROW_LIMIT, getLedgerExportRows } from "@/lib/ledger/queries";
import {
  resolveLedgerSortDir,
  resolveLedgerSortKey,
} from "@/lib/ledger/sort";
import { isAffiliateMockMode } from "@/lib/mock/config";
import { mockLedgerResponse } from "@/lib/mock/affiliate-fixtures";
import { requireAffiliateAuth } from "@/lib/mock/require-affiliate-auth";

const VALID_STATUSES = new Set<string>(Object.values(CommissionStatus));
const VALID_TYPES = new Set<string>(Object.values(LedgerEntryType));

function csvResponse(entries: ExportableEntry[], periodLabel: string) {
  return new NextResponse(ledgerToCsv(entries), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${csvFilename(periodLabel)}"`,
      // A download is a snapshot of the reader's own data; never let a shared
      // cache hold on to it.
      "Cache-Control": "private, no-store",
    },
  });
}

/**
 * The ledger as a spreadsheet, honouring the same filters as the table.
 *
 * A GET so the browser can download it from a plain link with the session
 * cookie attached, rather than shuttling a file through fetch and Blob.
 */
export async function GET(request: Request) {
  const auth = await requireAffiliateAuth();
  if ("error" in auth) return auth.error;

  const { searchParams } = new URL(request.url);
  const statusParam = searchParams.get("status");
  const typeParam = searchParams.get("type");
  const sortBy = resolveLedgerSortKey(searchParams.get("sort"));
  const period = periodFromParams(searchParams, { fallback: "all" });
  const sortDir = resolveLedgerSortDir(searchParams.get("dir"), sortBy);

  /**
   * Mock mode exports the same rows the table is showing. Without this the
   * download is an empty file while the screen behind it lists entries, which
   * reads as a broken button rather than an absent database.
   */
  if (isAffiliateMockMode()) {
    const { entries } = mockLedgerResponse({
      status: statusParam ?? undefined,
      type: typeParam ?? undefined,
      sourceAffiliateId: searchParams.get("sourceAffiliateId") ?? undefined,
      q: searchParams.get("q") ?? undefined,
      limit: EXPORT_ROW_LIMIT,
      sortBy,
      sortDir,
    });

    return csvResponse(
      entries.map((entry) => ({
        ...entry,
        type: entry.type as LedgerEntryType,
        occurredAt: new Date(entry.occurredAt),
        payoutWeek: entry.payoutWeek ? new Date(entry.payoutWeek) : null,
        paidAt: entry.paidAt ? new Date(entry.paidAt) : null,
      })),
      period.label
    );
  }

  let affiliateId = auth.user.affiliateId;
  if (auth.user.role === "ADMIN" && searchParams.get("affiliateId")) {
    affiliateId = searchParams.get("affiliateId");
  }

  if (!affiliateId) {
    return NextResponse.json({ error: "No affiliate linked" }, { status: 403 });
  }

  const entries = await getLedgerExportRows({
    affiliateId,
    status:
      statusParam && VALID_STATUSES.has(statusParam)
        ? (statusParam as CommissionStatus)
        : undefined,
    type:
      typeParam && VALID_TYPES.has(typeParam)
        ? (typeParam as LedgerEntryType)
        : undefined,
    sourceAffiliateId: searchParams.get("sourceAffiliateId") ?? undefined,
    teamId: searchParams.get("teamId") ?? undefined,
    q: searchParams.get("q") ?? undefined,
    range: period.range,
    sortBy,
    sortDir,
  });

  return csvResponse(entries, period.label);
}
