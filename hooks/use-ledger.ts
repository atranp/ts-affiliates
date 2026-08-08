"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import {
  defaultSortDirection,
  type LedgerSortKey,
  type SortDirection,
} from "@/lib/ledger/sort";
import { queryKeys } from "@/lib/query-keys";

export type { LedgerSortKey, SortDirection } from "@/lib/ledger/sort";
export {
  defaultSortDirection,
  ledgerSortParamsForUrl,
  resolveLedgerSortDir,
  resolveLedgerSortKey,
} from "@/lib/ledger/sort";

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
    pendingCount: number;
  };
  accountSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
    pendingCount: number;
  };
  overrideAccountSummary: {
    unpaidTotal: number;
    paidTotal: number;
    pendingTotal: number;
    unpaidCount: number;
    paidCount: number;
    pendingCount: number;
  };
  tabCounts: {
    all: number;
    unpaid: number;
    paid: number;
    pending: number;
    overrides: number;
    direct: number;
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
  sortBy?: LedgerSortKey;
  sortDir?: SortDirection;
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
  if (options.sortBy && options.sortBy !== "date") {
    params.set("sort", options.sortBy);
  }
  if (options.sortBy && options.sortDir) {
    if (options.sortDir !== defaultSortDirection(options.sortBy)) {
      params.set("dir", options.sortDir);
    }
  }
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

export type LedgerStatusTab = "all" | "unpaid" | "paid" | "pending";

/** Affiliate-facing entry type filter (maps to ledger API types). */
export type LedgerTypeFilter = "all" | "direct" | "team";

export function resolveLedgerStatusTab(
  value: string | null
): LedgerStatusTab {
  if (value === "overrides") return "all";
  const tabs: LedgerStatusTab[] = ["all", "unpaid", "paid", "pending"];
  return tabs.find((tab) => tab === value) ?? "all";
}

export function resolveLedgerTypeFilter(
  typeParam: string | null,
  statusParam: string | null
): LedgerTypeFilter {
  if (typeParam === "direct" || typeParam === "team") return typeParam;
  if (statusParam === "overrides") return "team";
  return "all";
}

export function ledgerTypeFilterToApi(
  filter: LedgerTypeFilter
): string | undefined {
  if (filter === "direct") return "DIRECT";
  if (filter === "team") return "OVERRIDE";
  return undefined;
}

/** Keep displayed rows aligned with the active type filter during stale fetches. */
export function filterLedgerEntriesByType<
  T extends { type: string },
>(entries: T[], typeFilter: LedgerTypeFilter): T[] {
  if (typeFilter === "direct") {
    return entries.filter((entry) => entry.type === "DIRECT");
  }
  if (typeFilter === "team") {
    return entries.filter((entry) => entry.type === "OVERRIDE");
  }
  return entries;
}

/** Keep displayed rows aligned with the active status filter during stale fetches. */
export function filterLedgerEntriesByStatus<
  T extends { status: string },
>(entries: T[], statusTab: LedgerStatusTab): T[] {
  if (statusTab === "unpaid") {
    return entries.filter((entry) => entry.status === "UNPAID");
  }
  if (statusTab === "paid") {
    return entries.filter((entry) => entry.status === "PAID");
  }
  if (statusTab === "pending") {
    return entries.filter((entry) => entry.status === "PENDING");
  }
  return entries;
}

export type LedgerTab =
  | LedgerStatusTab
  | "overrides"
  | "rejected";

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
