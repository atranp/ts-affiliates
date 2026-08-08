"use client";

import Link from "next/link";
import { Calendar, ChevronRight, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import {
  isPayoutPaid,
  payoutStatusClasses,
  payoutStatusLabel,
} from "@/lib/payouts/status";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { formatAppDate } from "@/lib/timezone";
import { cn, formatCurrency } from "@/lib/utils";

type PayoutsListProps = {
  detailHrefPrefix: string;
  affiliateView?: boolean;
  /** Show only the first N batches — for dashboard preview. */
  limit?: number;
  /** Drop outer chrome; meant to sit inside a Card on the home tab. */
  embedded?: boolean;
  onViewAll?: () => void;
};

export function PayoutsList({
  detailHrefPrefix,
  affiliateView = false,
  limit,
  embedded = false,
  onViewAll,
}: PayoutsListProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>("/api/payouts"),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {embedded ? "Loading payouts…" : "Loading payouts..."}
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load payouts"}
      </p>
    );
  }

  const batches = data?.batches ?? [];
  const visible = limit ? batches.slice(0, limit) : batches;
  const hasMore = limit != null && batches.length > limit;

  if (batches.length === 0) {
    if (embedded) {
      return (
        <p className="text-sm text-muted-foreground">
          {AFFILIATE_COPY.payouts.empty}
        </p>
      );
    }

    return (
      <div className="rounded-xl border border-border bg-card px-6 py-12 text-center shadow-xs">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
          <CreditCard className="h-6 w-6" />
        </div>
        <h2 className="text-base font-bold text-brand-dark">No payouts yet</h2>
        <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
          {affiliateView
            ? AFFILIATE_COPY.payouts.empty
            : "No payouts yet. When admin runs a payout, it will appear here."}
        </p>
      </div>
    );
  }

  const list = (
    <div className={embedded ? "divide-y divide-border" : "divide-y divide-border"}>
      {visible.map((batch) => (
        <PayoutBatchRow
          key={batch.id}
          batch={batch}
          href={`${detailHrefPrefix}/${batch.id}`}
          compact={embedded}
        />
      ))}
    </div>
  );

  if (embedded) {
    return (
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {list}
        </div>
        {hasMore && onViewAll && (
          <button
            type="button"
            onClick={onViewAll}
            className="mt-2 shrink-0 text-xs font-medium text-primary hover:underline"
          >
            +{batches.length - limit!} more — {AFFILIATE_COPY.home.payoutsAction}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-dark">
          Payout Runs
        </span>
      </div>

      {list}

      {hasMore && onViewAll && (
        <div className="border-t border-border bg-muted/30 px-4 py-3 text-center">
          <button
            type="button"
            onClick={onViewAll}
            className="text-xs font-semibold text-primary hover:underline"
          >
            View all payouts
          </button>
        </div>
      )}
    </div>
  );
}

function PayoutBatchRow({
  batch,
  href,
  compact,
}: {
  batch: PayoutBatchListItem;
  href: string;
  compact?: boolean;
}) {
  const paid = isPayoutPaid(batch.status);

  return (
    <Link
      href={href}
      className={cn(
        "flex transition-colors hover:bg-muted/50",
        compact
          ? "items-start gap-3 py-2.5 first:pt-0 last:pb-0"
          : "items-center justify-between gap-4 p-5"
      )}
    >
      <div
        className={cn(
          "flex min-w-0 flex-1",
          compact ? "items-start gap-2.5" : "items-center gap-3"
        )}
      >
        <div
          className={cn(
            "shrink-0 rounded-lg border p-2.5",
            paid
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          )}
        >
          <CreditCard className={compact ? "h-4 w-4" : "h-5 w-5"} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-brand-dark">
              {batch.label}
            </p>
            <span
              className={`rounded border px-2 py-0.5 text-[10px] font-bold ${payoutStatusClasses(batch.status)}`}
            >
              {payoutStatusLabel(batch.status)}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 shrink-0" />
              {paid ? "Paid " : "Created "}
              {formatAppDate(batch.processedAt ?? batch.createdAt)}
            </span>
            {!compact && (
              <>
                <span>·</span>
                <span>
                  {batch.entryCount}{" "}
                  {batch.entryCount === 1 ? "commission" : "commissions"}
                </span>
              </>
            )}
          </div>
          {compact && (
            <p
              className={cn(
                "mt-1.5 text-sm font-bold tabular-nums",
                paid ? "text-emerald-700" : "text-amber-700"
              )}
            >
              {formatCurrency(batch.totalAmount)}
            </p>
          )}
        </div>
      </div>
      {!compact && (
        <div className="flex shrink-0 items-center gap-3">
          <div className="text-right">
            <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
              Amount
            </span>
            <span
              className={cn(
                "text-lg font-bold tabular-nums",
                paid ? "text-emerald-700" : "text-amber-700"
              )}
            >
              {formatCurrency(batch.totalAmount)}
            </span>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        </div>
      )}
      {compact && (
        <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      )}
    </Link>
  );
}
