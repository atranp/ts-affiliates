"use client";

import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  AdminAffiliateDetail,
  AdminStats,
  PaginatedAffiliates,
} from "@/lib/admin/types";

export type DealRuleListItem = {
  id: string;
  name: string;
  type: string;
  ratePercent: string;
  basis: string;
  active: boolean;
  milestoneRevenueThreshold: string | null;
  teamId: string | null;
  team: { id: string; name: string } | null;
  sponsorAffiliate: { id: string; displayName: string | null; email: string };
  sourceAffiliate: { id: string; displayName: string | null; email: string } | null;
};

export type SettingsResponse = {
  hasWooCommerce: boolean;
  hasSliceWP: boolean;
  lastAffiliateSyncAt: string | null;
  lastCommissionSyncAt: string | null;
};

export function useAdminQuery<T>(
  key: readonly unknown[],
  url: string | null,
  options?: Omit<UseQueryOptions<T, Error>, "queryKey" | "queryFn">
) {
  return useQuery<T, Error>({
    queryKey: key,
    queryFn: () => apiFetch<T>(url!),
    enabled: !!url,
    ...options,
  });
}

export function useAdminStats() {
  return useAdminQuery<AdminStats>(queryKeys.admin.stats, "/api/admin/stats");
}

export function useAdminAffiliates(params: {
  page: number;
  q: string;
  status: string;
}) {
  const url = `/api/admin/affiliates?page=${params.page}&q=${encodeURIComponent(params.q)}&status=${params.status}`;
  return useAdminQuery<PaginatedAffiliates>(queryKeys.admin.affiliates(params), url, {
    placeholderData: keepPreviousData,
  });
}

export function useAdminAffiliate(id: string | null) {
  return useAdminQuery<AdminAffiliateDetail>(
    queryKeys.admin.affiliate(id ?? ""),
    id ? `/api/admin/affiliates/${id}` : null
  );
}

export function useAdminAffiliatePicker() {
  return useAdminQuery<PaginatedAffiliates>(
    queryKeys.admin.affiliates({ page: 1, q: "", status: "all", pageSize: 500 }),
    "/api/admin/affiliates?pageSize=500",
    { staleTime: 5 * 60 * 1000 }
  );
}

export function useAdminDealRules() {
  return useAdminQuery<DealRuleListItem[]>(
    queryKeys.admin.dealRules,
    "/api/admin/deal-rules"
  );
}

export function useAdminSettings() {
  return useAdminQuery<SettingsResponse>(
    queryKeys.admin.settings,
    "/api/settings"
  );
}

export function useAdminMutation<T>(
  invalidateKeys: readonly (readonly unknown[])[] = []
) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      url,
      options,
    }: {
      url: string;
      options?: RequestInit;
    }) => apiFetch<T>(url, options),
    onSuccess: async () => {
      for (const key of invalidateKeys) {
        await queryClient.invalidateQueries({ queryKey: key });
      }
    },
  });
}

/** @deprecated use apiFetch directly or useAdminMutation */
export async function adminMutate<T>(
  url: string,
  options?: RequestInit
): Promise<T> {
  return apiFetch<T>(url, options);
}

export { queryKeys };
