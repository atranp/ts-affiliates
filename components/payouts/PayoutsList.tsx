"use client";

import { CreditCard } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { ErrorState } from "@/components/admin/ErrorState";
import { InlinePanelSkeleton } from "@/components/affiliate/DashboardSkeleton";
import { PayoutDesktopTable, PayoutRow } from "@/components/affiliate/PayoutRow";
import {
  AffiliateEmptyState,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { cn, formatCurrency } from "@/lib/utils";

type PayoutsListProps = {
  detailHrefPrefix: string;
  affiliateView?: boolean;
  /** Show only the first N batches — for dashboard preview. */
  limit?: number;
  /** Drop outer chrome; meant to sit inside a Card on the home tab. */
  embedded?: boolean;
  onViewAll?: () => void;
  className?: string;
};

function toPayoutRowData(batch: PayoutBatchListItem) {
  return {
    id: batch.id,
    label: batch.label,
    status: batch.status,
    processedAt: batch.processedAt,
    createdAt: batch.createdAt,
    entryCount: batch.entryCount,
    totalAmount: batch.totalAmount,
  };
}

function PayoutBatchListItem({
  batch,
  href,
}: {
  batch: PayoutBatchListItem;
  href: string;
}) {
  return (
    <li>
      <PayoutRow {...toPayoutRowData(batch)} href={href} />
    </li>
  );
}

export function PayoutsList({
  detailHrefPrefix,
  affiliateView = false,
  limit,
  embedded = false,
  onViewAll,
  className,
}: PayoutsListProps) {
  const { data, isLoading, error, refetch } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>("/api/payouts"),
    staleTime: 60 * 1000,
  });

  const batches = data?.batches ?? [];
  const visible = limit ? batches.slice(0, limit) : batches;
  const hasMore = limit != null && batches.length > limit;
  const summaryTotal = visible.reduce(
    (sum, batch) => sum + batch.totalAmount,
    0,
  );

  if (isLoading) {
    return embedded ? (
      <InlinePanelSkeleton />
    ) : (
      <div
        className={cn(
          "ts-table-wrap min-w-0 max-w-full max-lg:overflow-visible",
          className,
        )}
      >
        <InlinePanelSkeleton className="m-3 min-h-[12rem] rounded-lg border-0" />
      </div>
    );
  }

  if (error) {
    return embedded ? (
      <AffiliateEmptyState className="py-6 text-left">
        {error instanceof Error ? error.message : "Failed to load payouts"}
      </AffiliateEmptyState>
    ) : (
      <ErrorState
        message={
          error instanceof Error ? error.message : "Failed to load payouts"
        }
        onRetry={() => refetch()}
      />
    );
  }

  if (batches.length === 0) {
    if (embedded) {
      return (
        <AffiliateEmptyState>{AFFILIATE_COPY.payouts.empty}</AffiliateEmptyState>
      );
    }

    return (
      <div
        className={cn(
          "ts-table-wrap min-w-0 max-w-full px-6 py-12 text-center",
          className,
        )}
      >
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
    <PayoutBatchListItem
      key={batch.id}
      batch={batch}
      href={`${detailHrefPrefix}/${batch.id}`}
    />
  ));

  if (embedded) {
    return (
      <div className="space-y-2.5">
        <AffiliateListPanel scroll inset>
          <ul className="flex flex-col gap-1.5">{rows}</ul>
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
    <div
      className={cn(
        "ts-table-wrap min-w-0 max-w-full overflow-x-auto max-lg:overflow-visible",
        className,
      )}
    >
      <div className="ts-table-summary">
        <p className="ts-row-meta flex w-full min-w-0 items-center justify-between gap-2">
          <span className="min-w-0 truncate">
            {visible.length.toLocaleString()}{" "}
            {visible.length === 1 ? "payout" : "payouts"}
          </span>
          <span className="ts-amount shrink-0 whitespace-nowrap text-primary">
            {formatCurrency(summaryTotal)}
          </span>
        </p>
      </div>

      <AffiliateListPanel inset className="ts-table-body lg:hidden">
        <ul className="flex flex-col gap-1.5">{rows}</ul>
      </AffiliateListPanel>

      <div className="ts-table-body hidden lg:block">
        <PayoutDesktopTable
          batches={visible.map(toPayoutRowData)}
          detailHrefPrefix={detailHrefPrefix}
        />
      </div>

      {hasMore && onViewAll && (
        <div className="border-t border-border/50 px-4 py-3 text-center">
          <button type="button" onClick={onViewAll} className="ts-text-link">
            View all payouts
          </button>
        </div>
      )}
    </div>
  );
}
