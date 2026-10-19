"use client";

import { RefreshCw } from "lucide-react";
import { WooOrderLink } from "@/components/admin/WooOrderLink";
import { AffiliateBadge } from "@/components/affiliate/AffiliateBadge";
import { AffiliateAmountCell } from "@/components/affiliate/primitives";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { PayoutDraft } from "@/lib/payouts/create";
import type { PayoutOption } from "@/lib/payouts/options";
import { APP_TIMEZONE_LABEL, formatAppDateTime } from "@/lib/timezone";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

export function ReviewHero({
  draft,
  selected,
}: {
  draft: PayoutDraft;
  selected: PayoutOption;
}) {
  const isDirect = selected.target.scope === "direct";

  return (
    <div className="ts-payout-hero">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="ts-row-title">{selected.label}</h3>
            <AffiliateBadge variant={isDirect ? "direct" : "team"}>
              {isDirect ? "Direct" : "Team"}
            </AffiliateBadge>
          </div>
          <p className="ts-row-meta">
            {draft.targetLabel} · {draft.affiliateName}
          </p>
          {selected.math && <p className="ts-micro">{selected.math}</p>}
        </div>
        <p className="ts-payout-hero-amount shrink-0">
          {formatCurrency(draft.totalAmount)}
        </p>
      </div>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <AffiliateBadge variant="neutral">
          {draft.entryCount.toLocaleString("en-US")} commissions
        </AffiliateBadge>
        {draft.revenueTotal > 0 && (
          <AffiliateBadge variant="paid">
            {formatCurrency(draft.revenueTotal)} sales
          </AffiliateBadge>
        )}
      </div>
    </div>
  );
}

export function CutoffBar({
  cutoff,
  syncedAt,
  syncFailed,
  refreshing,
  onRefresh,
}: {
  cutoff: string;
  syncedAt: number | null;
  syncFailed: boolean;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="ts-payout-cutoff">
      <div className="min-w-0">
        <p className="ts-row-meta text-brand-dark">
          Unpaid through{" "}
          <span className="font-semibold text-brand-dark">
            {formatAppDateTime(cutoff)}
          </span>{" "}
          ({APP_TIMEZONE_LABEL})
        </p>
        <p className="ts-row-meta mt-0.5">
          {syncFailed
            ? "SliceWP could not be reached — totals may be out of date."
            : syncedAt
              ? `SliceWP read at ${formatAppDateTime(new Date(syncedAt))}.`
              : "Not yet checked against SliceWP."}
        </p>
      </div>
      <Button
        size="sm"
        variant="outline"
        className="h-8 shrink-0 rounded-lg px-3 text-xs"
        disabled={refreshing}
        onClick={onRefresh}
      >
        <RefreshCw
          className={cn("mr-1.5 h-3.5 w-3.5", refreshing && "animate-spin")}
        />
        {refreshing ? "Refreshing…" : "Refresh"}
      </Button>
    </div>
  );
}

export function EntriesTable({
  draft,
  compact,
}: {
  draft: PayoutDraft;
  compact?: boolean;
}) {
  const showSource = draft.target.scope !== "direct";
  const rows = compact ? draft.entries.slice(0, 5) : draft.entries;

  return (
    <div className="space-y-2">
      <p className="ts-row-meta rounded-md border border-border/60 bg-muted/25 px-2.5 py-1.5">
        {draft.entriesTruncated
          ? compact
            ? `Latest ${rows.length} of ${draft.entryCount.toLocaleString("en-US")} commissions — export CSV for all.`
            : `Showing the ${draft.entries.length} most recent of ${draft.entryCount.toLocaleString("en-US")} commissions. The total above covers all of them — export the CSV for every line.`
          : compact
            ? `All ${draft.entries.length} commissions.`
            : `All ${draft.entries.length} commissions in this payout.`}
      </p>
      <div className="ts-table-wrap">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="ts-table-header h-10 px-3 text-left first:pl-4">
                Sale
              </TableHead>
              {showSource && !compact && (
                <TableHead className="ts-table-header h-10 px-3 text-left">
                  Member
                </TableHead>
              )}
              <TableHead className="ts-table-header h-10 px-3 text-right last:pr-4">
                Earned
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((entry) => (
              <TableRow
                key={entry.id}
                className="border-border/60 hover:bg-muted/40"
              >
                <TableCell className="px-3 py-2.5 first:pl-4">
                  <p className="ts-row-meta whitespace-nowrap">
                    {formatSaleDate(entry.occurredAt)}
                  </p>
                  {entry.wooOrderId ? (
                    <WooOrderLink
                      orderId={entry.wooOrderId}
                      className="text-xs"
                    />
                  ) : null}
                </TableCell>
                {showSource && !compact && (
                  <TableCell className="ts-row-title px-3 py-2.5">
                    {entry.sourceAffiliateName ?? "Direct sale"}
                  </TableCell>
                )}
                <TableCell className="whitespace-nowrap px-3 py-2.5 text-right last:pr-4">
                  <AffiliateAmountCell
                    amount={formatCurrency(entry.amount)}
                    tone="primary"
                  />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
