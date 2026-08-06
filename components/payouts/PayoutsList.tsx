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
import { formatCurrency } from "@/lib/utils";

export function PayoutsList({
  detailHrefPrefix,
  affiliateView = false,
}: {
  detailHrefPrefix: string;
  affiliateView?: boolean;
}) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>("/api/payouts"),
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading payouts...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">
        {error instanceof Error ? error.message : "Failed to load payouts"}
      </p>
    );
  }

  if (!data?.batches.length) {
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

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
      <div className="flex items-center justify-between border-b border-border bg-muted px-4 py-3">
        <span className="text-xs font-semibold uppercase tracking-wider text-brand-dark">
          Payout Runs
        </span>
      </div>

      <div className="divide-y divide-border">
        {data.batches.map((batch) => {
          const paid = isPayoutPaid(batch.status);
          return (
            <Link
              key={batch.id}
              href={`${detailHrefPrefix}/${batch.id}`}
              className="flex items-center justify-between gap-4 p-5 transition-colors hover:bg-muted/50"
            >
              <div className="flex min-w-0 items-center gap-4">
                <div
                  className={`rounded-lg border p-3 ${
                    paid
                      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                      : "border-amber-200 bg-amber-50 text-amber-700"
                  }`}
                >
                  <CreditCard className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-bold text-brand-dark">
                      {batch.label}
                    </p>
                    <span
                      className={`rounded border px-2 py-0.5 text-[10px] font-bold ${payoutStatusClasses(batch.status)}`}
                    >
                      {payoutStatusLabel(batch.status)}
                    </span>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5" />
                      {paid ? "Paid " : "Created "}
                      {formatAppDate(batch.processedAt ?? batch.createdAt)}
                    </span>
                    <span>•</span>
                    <span>
                      {batch.entryCount}{" "}
                      {batch.entryCount === 1 ? "commission" : "commissions"}
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-4">
                <div className="text-right">
                  <span className="block text-[10px] font-semibold uppercase text-muted-foreground">
                    Amount
                  </span>
                  <span
                    className={`text-lg font-bold ${paid ? "text-emerald-700" : "text-amber-700"}`}
                  >
                    {formatCurrency(batch.totalAmount)}
                  </span>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground" />
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
