"use client";

import { useEffect, useRef, useState } from "react";
import type { ReadonlyURLSearchParams } from "next/navigation";
import {
  defaultSortDirection,
  ledgerSortParamsForUrl,
  ledgerTabToFilters,
  ledgerTypeFilterToApi,
  resolveLedgerSortDir,
  resolveLedgerSortKey,
  resolveLedgerStatusTab,
  resolveLedgerTypeFilter,
  type LedgerSortKey,
  type LedgerStatusTab,
  type LedgerTypeFilter,
  type SortDirection,
} from "@/hooks/use-ledger";
import type { SetParams } from "@/hooks/use-url-params";

const SEARCH_DEBOUNCE_MS = 300;

type PeriodParams = { period: string; from?: string; to?: string };

/**
 * The affiliate ledger's filters, sort, page, and search, read from and
 * written to the URL. Returns both the values the table renders and the
 * matching `useLedger` options, so the two cannot disagree.
 */
export function useLedgerUrlFilters(
  searchParams: ReadonlyURLSearchParams,
  setParams: SetParams,
  periodParams: PeriodParams
) {
  const statusParam = searchParams.get("status");
  const ledgerTab = resolveLedgerStatusTab(statusParam);
  const typeFilter = resolveLedgerTypeFilter(searchParams.get("type"), statusParam);
  const sourceFilter = searchParams.get("member") ?? "all";
  const teamFilter = searchParams.get("team") ?? "all";
  const urlQuery = searchParams.get("q") ?? "";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1") || 1);
  const sortKey = resolveLedgerSortKey(searchParams.get("sort"));
  const sortDir = resolveLedgerSortDir(searchParams.get("dir"), sortKey);

  // Typing stays local for responsiveness, then lands in the URL once settled.
  const [q, setQ] = useState(urlQuery);
  const lastWritten = useRef(urlQuery);

  // Adopt query changes we did not cause, so back/forward and "clear filters"
  // are not immediately overwritten by the pending debounce.
  useEffect(() => {
    if (urlQuery !== lastWritten.current) {
      lastWritten.current = urlQuery;
      setQ(urlQuery);
    }
  }, [urlQuery]);

  useEffect(() => {
    if (q === urlQuery) return;
    const timer = setTimeout(() => {
      lastWritten.current = q;
      setParams({ q: q || null, page: null });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [q, urlQuery, setParams]);

  const tabFilters = ledgerTabToFilters(ledgerTab, sourceFilter);
  const typeQuery = ledgerTypeFilterToApi(typeFilter);

  const ledgerQuery = {
    ...tabFilters,
    ...typeQuery,
    q: urlQuery,
    teamId: teamFilter !== "all" ? teamFilter : undefined,
    ...periodParams,
    page,
    limit: 50,
    sortBy: sortKey,
    sortDir,
  };

  /**
   * The CSV has to answer for exactly what is on screen, so it is built from
   * the same values the table query uses rather than from the raw URL — the
   * status tab and the type filter both translate before they reach the API.
   */
  const exportParams = new URLSearchParams();
  if (tabFilters.status) exportParams.set("status", tabFilters.status);
  if (tabFilters.type) exportParams.set("type", tabFilters.type);
  if (typeQuery.type) exportParams.set("type", typeQuery.type);
  if (typeQuery.directKind) exportParams.set("directKind", typeQuery.directKind);
  if (tabFilters.sourceAffiliateId) {
    exportParams.set("sourceAffiliateId", tabFilters.sourceAffiliateId);
  }
  if (teamFilter !== "all") exportParams.set("teamId", teamFilter);
  if (urlQuery) exportParams.set("q", urlQuery);
  exportParams.set("period", periodParams.period);
  if (periodParams.from) exportParams.set("from", periodParams.from);
  if (periodParams.to) exportParams.set("to", periodParams.to);
  exportParams.set("sort", sortKey);
  exportParams.set("dir", sortDir);
  const exportHref = `/api/ledger/export?${exportParams.toString()}`;

  const filtersActive =
    ledgerTab !== "all" ||
    typeFilter !== "all" ||
    sourceFilter !== "all" ||
    teamFilter !== "all" ||
    urlQuery !== "";

  function onSortChange(key: LedgerSortKey, dir: SortDirection) {
    setParams({ ...ledgerSortParamsForUrl(key, dir), page: null });
  }

  return {
    ledgerTab,
    typeFilter,
    sourceFilter,
    teamFilter,
    q,
    page,
    sortKey,
    sortDir,
    filtersActive,
    exportHref,
    ledgerQuery,
    onSearchChange: setQ,
    onLedgerTab(value: LedgerStatusTab) {
      setParams({ status: value === "all" ? null : value, page: null });
    },
    onTypeFilter(value: LedgerTypeFilter) {
      setParams({
        type: value === "all" ? null : value,
        status: statusParam === "overrides" ? null : statusParam,
        ...(value === "direct" || value === "lifetime"
          ? { team: null, member: null }
          : {}),
        page: null,
      });
    },
    onTeamFilter(value: string) {
      setParams({
        team: value === "all" ? null : value,
        // A team and a single member are mutually exclusive narrowings.
        ...(value === "all" ? {} : { member: null }),
        page: null,
      });
    },
    onSourceFilter(value: string) {
      setParams({ member: value === "all" ? null : value, page: null });
    },
    onPageChange(nextPage: number) {
      setParams({ page: nextPage <= 1 ? null : String(nextPage) });
    },
    onSort(key: LedgerSortKey) {
      const nextDir =
        sortKey === key
          ? sortDir === "asc"
            ? "desc"
            : "asc"
          : defaultSortDirection(key);
      onSortChange(key, nextDir);
    },
    onSortChange,
    onClearFilters() {
      setQ("");
      setParams({
        status: null,
        type: null,
        member: null,
        team: null,
        q: null,
        page: null,
        sort: null,
        dir: null,
      });
    },
  };
}
