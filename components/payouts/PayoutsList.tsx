"use client";

import Link from "next/link";
import { Calendar, ChevronRight, CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import {
  AffiliateAmountCell,
  AffiliateEmptyState,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
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
    return embedded ? (
      <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/30" />
    ) : (
      <p className="text-sm text-muted-foreground">Loading payouts…</p>
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
        <AffiliateEmptyState>{AFFILIATE_COPY.payouts.empty}</AffiliateEmptyState>
      );
    }

    return (
      <div className="ts-home-card px-6 py-12 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200/80">
          <CreditCard className="h-6 w-6" />
        </div>
        <h2 className="text-base font-semibold text-brand-dark">No payouts yet</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
          {affiliateView
            ? AFFILIATE_COPY.payouts.empty
            : "No payouts yet. When admin runs a payout, it will appear here."}
        </p>
      </div>
    );
  }

  const rows = visible.map((batch) => (
    <PayoutBatchRow
      key={batch.id}
      batch={batch}
      href={`${detailHrefPrefix}/${batch.id}`}
      compact={embedded}
    />
  ));

  if (embedded) {
    return (
      <div className="space-y-3">
        <AffiliateListPanel scroll>
          <ul className="divide-y divide-border/60">{rows}</ul>
        </AffiliateListPanel>
        {hasMore && onViewAll && (
          <button type="button" onClick={onViewAll} className="ts-text-link">
            +{batches.length - limit!} more — {AFFILIATE_COPY.home.payoutsAction}
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="ts-list-panel">
      <div className="border-b border-border/60 bg-muted/30 px-4 py-3">
        <span className="ts-section-label text-brand-dark">Payout runs</span>
      </div>
      <div className="divide-y divide-border/60">{rows}</div>
      {hasMore && onViewAll && (
        <div className="border-t border-border/60 bg-muted/20 px-4 py-3 text-center">
          <button type="button" onClick={onViewAll} className="ts-text-link">
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

  if (compact) {
    return (
      <li>
        <Link
          href={href}
          className="ts-list-row items-center gap-3 px-4 py-3"
        >
          <div
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full ring-1",
              paid
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200/80"
                : "bg-amber-50 text-amber-700 ring-amber-200/80"
            )}
          >
            <CreditCard className="h-4 w-4" aria-hidden />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="truncate text-sm font-semibold text-brand-dark">
                {batch.label}
              </p>
              <span
                className={cn(
                  "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                  payoutStatusClasses(batch.status)
                )}
              >
                {payoutStatusLabel(batch.status)}
              </span>
            </div>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {paid ? "Paid " : "Created "}
              {formatAppDate(batch.processedAt ?? batch.createdAt)}
            </p>
          </div>
          <AffiliateAmountCell
            amount={formatCurrency(batch.totalAmount)}
            sublabel={paid ? "Paid" : "Awaiting payment"}
            tone={paid ? "success" : "warning"}
          />
        </Link>
      </li>
    );
  }

  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/40"
    >
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div
          className={cn(
            "shrink-0 rounded-lg border p-2.5",
            paid
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-amber-200 bg-amber-50 text-amber-700"
          )}
        >
          <CreditCard className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-brand-dark">
              {batch.label}
            </p>
            <span
              className={cn(
                "rounded-md border px-2 py-0.5 text-[10px] font-bold",
                payoutStatusClasses(batch.status)
              )}
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
            <span>·</span>
            <span>
              {batch.entryCount}{" "}
              {batch.entryCount === 1 ? "commission" : "commissions"}
            </span>
          </div>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-3">
        <AffiliateAmountCell
          amount={formatCurrency(batch.totalAmount)}
          sublabel="Total"
          tone={paid ? "success" : "warning"}
        />
        <ChevronRight className="h-4 w-4 text-muted-foreground" />
      </div>
    </Link>
  );
}
