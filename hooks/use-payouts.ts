"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { PayoutBatchDetail, PayoutBatchListItem } from "@/lib/payouts/types";

/** The signed-in affiliate's payout receipts. */
export function useAffiliatePayouts(enabled = true) {
  return useQuery({
    queryKey: queryKeys.payouts,
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>("/api/payouts"),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function useAffiliatePayout(id: string) {
  return useQuery({
    queryKey: queryKeys.payout(id),
    queryFn: () => apiFetch<{ batch: PayoutBatchDetail }>(`/api/payouts/${id}`),
  });
}
