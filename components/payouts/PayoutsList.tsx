"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { formatCurrency } from "@/lib/utils";

export function PayoutsList({
  detailHrefPrefix,
}: {
  detailHrefPrefix: string;
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
      <p className="text-sm text-muted-foreground">
        No payouts yet. When admin runs a payout, it will appear here.
      </p>
    );
  }

  return (
    <div className="divide-y divide-border rounded-lg border border-border">
      {data.batches.map((batch) => (
        <Link
          key={batch.id}
          href={`${detailHrefPrefix}/${batch.id}`}
          className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-muted/50"
        >
          <div className="min-w-0">
            <p className="font-medium truncate">{batch.label}</p>
            <p className="text-xs text-muted-foreground">
              {batch.teamName ?? "Payout"} · {batch.entryCount}{" "}
              {batch.entryCount === 1 ? "entry" : "entries"} ·{" "}
              {new Date(batch.processedAt ?? batch.createdAt).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" }
              )}
            </p>
          </div>
          <div className="flex items-center gap-3 shrink-0">
            <span className="font-semibold text-success">
              {formatCurrency(batch.totalAmount)}
            </span>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </div>
        </Link>
      ))}
    </div>
  );
}
