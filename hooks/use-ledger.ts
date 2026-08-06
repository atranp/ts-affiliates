"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import { queryKeys } from "@/lib/query-keys";

export type LedgerEntry = {
  id: string;
  type: string;
  amount: string;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: string | null;
  payoutWeek: string | null;
  paidAt: string | null;
  occurredAt: string;
  payoutBatchId: string | null;
  payoutBatch?: { id: string; label: string; status: string } | null;
  sourceAffiliateId: string | null;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
  dealRule?: { id: string; name: string } | null;
};

export type LedgerData = {
  entries: LedgerEntry[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  /** Sum and count of everything the active filters match, not just this page. */
  filtered: {
    amount: number;
    count: number;
  };
  summary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
  };
  overrideSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
  };
  teamBonuses: Array<{
    sourceAffiliateId: string;
    displayName: string | null;
    email: string;
    unpaidTotal: number;
    unpaidCount: number;
    paidTotal: number;
    paidCount: number;
    pendingTotal: number;
    pendingCount: number;
    milestone: {
      current: number;
      threshold: number;
      met: boolean;
      remaining: number;
    } | null;
  }>;
  sourceAffiliates: Array<{
    id: string;
    displayName: string | null;
    email: string;
  }>;
};

export type LedgerQueryOptions = {
  affiliateId?: string;
  page?: number;
  limit?: number;
  status?: string;
  type?: string;
  sourceAffiliateId?: string;
  teamId?: string;
  q?: string;
  enabled?: boolean;
};

function buildLedgerUrl(options: LedgerQueryOptions): string {
  const params = new URLSearchParams();
  if (options.affiliateId) params.set("affiliateId", options.affiliateId);
  if (options.page) params.set("page", String(options.page));
  if (options.limit) params.set("limit", String(options.limit));
  if (options.status) params.set("status", options.status);
  if (options.type) params.set("type", options.type);
  if (options.q) params.set("q", options.q);
  if (options.sourceAffiliateId) {
    params.set("sourceAffiliateId", options.sourceAffiliateId);
  }
  if (options.teamId) params.set("teamId", options.teamId);
  const qs = params.toString();
  return qs ? `/api/ledger?${qs}` : "/api/ledger";
}

export function useLedger(options: LedgerQueryOptions = {}) {
  const { enabled = true, ...queryParams } = options;
  const url = buildLedgerUrl(queryParams);

  return useQuery<LedgerData, Error>({
    queryKey: queryKeys.ledger(queryParams),
    queryFn: () => apiFetch<LedgerData>(url),
    enabled,
    staleTime: 60 * 1000,
    placeholderData: keepPreviousData,
  });
}

export type LedgerTab =
  | "all"
  | "unpaid"
  | "paid"
  | "pending"
  | "rejected"
  | "overrides";

export function ledgerTabToFilters(
  tab: LedgerTab,
  sourceAffiliateId?: string
): Pick<LedgerQueryOptions, "status" | "type" | "sourceAffiliateId"> {
  const filters: Pick<
    LedgerQueryOptions,
    "status" | "type" | "sourceAffiliateId"
  > = {};

  if (tab === "unpaid") filters.status = "UNPAID";
  if (tab === "paid") filters.status = "PAID";
  if (tab === "pending") filters.status = "PENDING";
  if (tab === "rejected") filters.status = "REJECTED";
  if (tab === "overrides") filters.type = "OVERRIDE";
  if (sourceAffiliateId && sourceAffiliateId !== "all") {
    filters.sourceAffiliateId = sourceAffiliateId;
  }

  return filters;
}
