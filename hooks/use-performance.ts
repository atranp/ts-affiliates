"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type { AffiliatePerformance } from "@/lib/affiliate/performance";

export type PerformanceResponse = AffiliatePerformance & {
  period: {
    key: string;
    label: string;
    comparisonLabel: string | null;
  };
};

export type PerformanceQueryOptions = {
  period: string;
  from?: string;
  to?: string;
  enabled?: boolean;
};

export function usePerformance({
  period,
  from,
  to,
  enabled = true,
}: PerformanceQueryOptions) {
  const params = new URLSearchParams({ period });
  if (from) params.set("from", from);
  if (to) params.set("to", to);

  return useQuery<PerformanceResponse, Error>({
    queryKey: queryKeys.performance({ period, from, to }),
    queryFn: () =>
      apiFetch<PerformanceResponse>(`/api/performance?${params.toString()}`),
    enabled,
    staleTime: 60 * 1000,
    // Switching periods should redraw in place rather than flashing skeletons.
    placeholderData: (previous) => previous,
  });
}

/** Percent change, or null when the baseline is zero and a ratio would lie. */
export function percentChange(
  current: number,
  previous: number | undefined | null
): number | null {
  if (previous === undefined || previous === null) return null;
  if (previous === 0) return null;
  return ((current - previous) / previous) * 100;
}
