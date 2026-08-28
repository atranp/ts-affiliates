"use client";

import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";
import type {
  AffiliateCouponRow,
  AffiliateLink,
  AffiliateVisits,
  CreativeRow,
} from "@/lib/affiliate/reach";

/**
 * Reads for the promotional tabs. All of it is a mirror of SliceWP refreshed by
 * sync, so it is cached for longer than the ledger — a click count that is a
 * few minutes stale is not worth a request on every tab switch.
 */
const REACH_STALE_TIME = 5 * 60 * 1000;

export function useAffiliateLink(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.links,
    queryFn: () => apiFetch<AffiliateLink>("/api/links"),
    enabled,
    staleTime: REACH_STALE_TIME,
  });
}

export function useAffiliateVisits(page: number, enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.visits(page),
    queryFn: () => apiFetch<AffiliateVisits>(`/api/visits?page=${page}`),
    enabled,
    staleTime: REACH_STALE_TIME,
    // Paging through history should not blank the table between pages.
    placeholderData: (previous) => previous,
  });
}

export function useAffiliateCreatives(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.creatives,
    queryFn: () =>
      apiFetch<{ creatives: CreativeRow[]; referralUrl: string | null }>(
        "/api/creatives"
      ),
    enabled,
    staleTime: REACH_STALE_TIME,
  });
}

export function useAffiliateCoupons(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.coupons,
    queryFn: () =>
      apiFetch<{ coupons: AffiliateCouponRow[] }>("/api/coupons"),
    enabled,
    staleTime: REACH_STALE_TIME,
  });
}

export type AffiliateAccountSettings = {
  paymentEmail: string | null;
  accountEmail: string | null;
  website?: string | null;
  customSlug: string | null;
  referralUrl: string | null;
};

export function useAffiliateSettings(enabled: boolean) {
  return useQuery({
    queryKey: queryKeys.accountSettings,
    queryFn: () => apiFetch<AffiliateAccountSettings>("/api/account/settings"),
    enabled,
    staleTime: REACH_STALE_TIME,
  });
}
