import { LedgerEntryType } from "@prisma/client";
import { AFFILIATE_COPY, formatCommissionStatus } from "@/lib/affiliate/copy";
import { formatStoreDateInput } from "@/lib/payouts/store-dates";
import { commissionableSale, toNumber } from "@/lib/utils";

/**
 * CSV of an affiliate's ledger, matching whatever filters produced it.
 *
 * Amounts go out as bare numbers rather than formatted currency so the file is
 * something a spreadsheet can sum. Dates use the store calendar, so a row here
 * lands on the same day it does on screen.
 */

export type ExportableEntry = {
  occurredAt: Date;
  type: LedgerEntryType;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: unknown;
  commissionBase?: unknown;
  amount: unknown;
  status: string;
  payoutWeek: Date | null;
  paidAt: Date | null;
  sourceAffiliate?: { displayName: string | null; email: string } | null;
  payoutBatch?: { label: string } | null;
  trackedByClick?: boolean | null;
  isLifetimeSale?: boolean;
};

const COLUMNS = [
  "Date",
  "Type",
  "Details",
  "Order",
  "Sale amount",
  "Your earnings",
  "Status",
  "Tracked by",
  "Payout",
  "Paid on",
] as const;

/**
 * Quotes only when the value could otherwise break a cell, and doubles any
 * quotes inside it. A leading `=`, `+`, `-` or `@` is prefixed with a single
 * quote so a description cannot be read as a formula when the file is opened.
 */
function cell(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";

  const raw = String(value);
  const guarded = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;

  return /[",\n\r]/.test(guarded)
    ? `"${guarded.replace(/"/g, '""')}"`
    : guarded;
}

function trackedLabel(entry: ExportableEntry): string {
  if (entry.type !== LedgerEntryType.DIRECT) return "";
  if (entry.isLifetimeSale) {
    return AFFILIATE_COPY.commissions.tracked.linkedCustomer;
  }
  if (entry.trackedByClick === null || entry.trackedByClick === undefined) {
    return "";
  }
  return entry.trackedByClick ? "Link click" : "No click recorded";
}

export function ledgerToCsv(entries: ExportableEntry[]): string {
  const rows = entries.map((entry) =>
    [
      formatStoreDateInput(entry.occurredAt),
      entry.isLifetimeSale
        ? AFFILIATE_COPY.commissions.typeLifetime
        : entry.type === LedgerEntryType.OVERRIDE
          ? "Team earning"
          : "Direct sale",
      entry.description ??
        entry.sourceAffiliate?.displayName ??
        entry.sourceAffiliate?.email ??
        "",
      entry.wooOrderId ?? "",
      commissionableSale(entry) == null
        ? ""
        : toNumber(commissionableSale(entry)).toFixed(2),
      toNumber(entry.amount).toFixed(2),
      formatCommissionStatus(entry.status),
      trackedLabel(entry),
      entry.payoutBatch?.label ?? "",
      entry.paidAt ? formatStoreDateInput(entry.paidAt) : "",
    ]
      .map(cell)
      .join(",")
  );

  // CRLF and a UTF-8 BOM keep Excel from mangling the encoding on open.
  return `\uFEFF${[COLUMNS.join(","), ...rows].join("\r\n")}\r\n`;
}

export function csvFilename(periodLabel: string): string {
  const slug = periodLabel
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `commissions-${slug || "all-time"}.csv`;
}
