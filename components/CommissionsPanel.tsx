"use client";

import {
  CheckCircle2,
  Clock,
  DollarSign,
  Search,
  Users,
} from "lucide-react";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
import { LedgerTable } from "@/components/LedgerTable";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { LedgerData, LedgerTypeFilter } from "@/hooks/use-ledger";
import type { TeamSummary } from "@/lib/teams/queries";
import { cn, formatCurrency } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export type CommissionsTab = "all" | "unpaid" | "paid" | "pending";

type CommissionsPanelProps = {
  data: LedgerData;
  teams?: TeamSummary[];
  ledgerTab: CommissionsTab;
  typeFilter: LedgerTypeFilter;
  sourceFilter: string;
  teamFilter: string;
  q: string;
  page: number;
  isFetching: boolean;
  filtersActive: boolean;
  onLedgerTab: (tab: CommissionsTab) => void;
  onTypeFilter: (value: LedgerTypeFilter) => void;
  onTeamFilter: (value: string) => void;
  onSourceFilter: (value: string) => void;
  onSearchChange: (value: string) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  fillHeight?: boolean;
  className?: string;
};

const TAB_ORDER: Array<{
  key: CommissionsTab;
  label: (typeof AFFILIATE_COPY.commissions.tabs)[keyof typeof AFFILIATE_COPY.commissions.tabs];
  countKey: keyof LedgerData["tabCounts"];
}> = [
  { key: "all", label: AFFILIATE_COPY.commissions.tabs.all, countKey: "all" },
  {
    key: "unpaid",
    label: AFFILIATE_COPY.commissions.tabs.payout,
    countKey: "unpaid",
  },
  {
    key: "paid",
    label: AFFILIATE_COPY.commissions.tabs.paid,
    countKey: "paid",
  },
  {
    key: "pending",
    label: AFFILIATE_COPY.commissions.tabs.awaitingMilestone,
    countKey: "pending",
  },
];

export function CommissionsPanel({
  data,
  teams,
  ledgerTab,
  typeFilter,
  sourceFilter,
  teamFilter,
  q,
  page,
  isFetching,
  filtersActive,
  onLedgerTab,
  onTypeFilter,
  onTeamFilter,
  onSourceFilter,
  onSearchChange,
  onClearFilters,
  onPageChange,
  fillHeight = false,
  className,
}: CommissionsPanelProps) {
  const { accountSummary, overrideAccountSummary, tabCounts } = data;
  const showTeamEarningsStat =
    overrideAccountSummary.unpaidTotal > 0 ||
    overrideAccountSummary.paidTotal > 0 ||
    overrideAccountSummary.pendingTotal > 0;

  const visibleTabs = TAB_ORDER.filter(
    (tab) => tab.key !== "pending" || tabCounts.pending > 0
  );

  return (
    <div
      className={cn(
        "flex min-h-0 flex-col gap-5",
        fillHeight && "min-h-0 flex-1 basis-0",
        className
      )}
    >
      <div
        className={cn(
          "grid shrink-0 gap-4 sm:grid-cols-2",
          showTeamEarningsStat ? "xl:grid-cols-4" : "xl:grid-cols-3"
        )}
      >
        <AffiliateStatCard
          label={AFFILIATE_COPY.stats.owed.label}
          hint={AFFILIATE_COPY.commissions.statsHints.payout}
          value={accountSummary.unpaidTotal}
          tone="primary"
          icon={DollarSign}
          actionLabel={ledgerTab === "unpaid" ? undefined : "View"}
          onAction={
            ledgerTab === "unpaid" ? undefined : () => onLedgerTab("unpaid")
          }
        />
        <AffiliateStatCard
          label={AFFILIATE_COPY.stats.paid.label}
          hint={AFFILIATE_COPY.commissions.statsHints.paid}
          value={accountSummary.paidTotal}
          tone="success"
          icon={CheckCircle2}
          actionLabel={ledgerTab === "paid" ? undefined : "View"}
          onAction={
            ledgerTab === "paid" ? undefined : () => onLedgerTab("paid")
          }
        />
        {accountSummary.pendingTotal > 0 && (
          <AffiliateStatCard
            label={AFFILIATE_COPY.team.awaitingMilestone}
            hint={AFFILIATE_COPY.commissions.statsHints.awaitingMilestone}
            value={accountSummary.pendingTotal}
            tone="warning"
            icon={Clock}
            actionLabel={ledgerTab === "pending" ? undefined : "View"}
            onAction={
              ledgerTab === "pending" ? undefined : () => onLedgerTab("pending")
            }
          />
        )}
        {showTeamEarningsStat && (
          <AffiliateStatCard
            label={AFFILIATE_COPY.commissions.tabs.teamEarnings}
            hint={AFFILIATE_COPY.commissions.statsHints.teamEarnings}
            value={overrideAccountSummary.unpaidTotal}
            tone="primary"
            icon={Users}
            actionLabel={typeFilter === "team" ? undefined : "View"}
            onAction={
              typeFilter === "team" ? undefined : () => onTypeFilter("team")
            }
          />
        )}
      </div>

      <div
        className={cn(
          "ts-table-wrap bg-card shadow-xs",
          fillHeight && "ts-table-fill"
        )}
      >
        <div className="ts-table-toolbar shrink-0 space-y-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="ts-segment flex-wrap">
              {visibleTabs.map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  aria-pressed={ledgerTab === tab.key}
                  onClick={() => onLedgerTab(tab.key)}
                  className={cn(
                    "ts-segment-item",
                    ledgerTab === tab.key
                      ? "ts-segment-item-active"
                      : "ts-segment-item-inactive"
                  )}
                >
                  {tab.label}
                  <span className="ml-1.5 tabular-nums opacity-70">
                    {tabCounts[tab.countKey].toLocaleString()}
                  </span>
                </button>
              ))}
            </div>

            <div className="relative w-full lg:max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(event) => onSearchChange(event.target.value)}
                placeholder={AFFILIATE_COPY.commissions.searchPlaceholder}
                className="ts-input pl-9"
                aria-label={AFFILIATE_COPY.commissions.searchPlaceholder}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
              <select
                aria-label={AFFILIATE_COPY.commissions.allTypes}
                className="select-field w-full sm:max-w-xs"
                value={typeFilter}
                onChange={(event) =>
                  onTypeFilter(event.target.value as LedgerTypeFilter)
                }
              >
                <option value="all">
                  {AFFILIATE_COPY.commissions.allTypes} (
                  {tabCounts.all.toLocaleString()})
                </option>
                <option value="direct">
                  {AFFILIATE_COPY.commissions.typeDirect} (
                  {tabCounts.direct.toLocaleString()})
                </option>
                <option value="team">
                  {AFFILIATE_COPY.commissions.typeTeam} (
                  {tabCounts.overrides.toLocaleString()})
                </option>
              </select>
              {teams && teams.length > 0 && (
                <select
                  aria-label={AFFILIATE_COPY.commissions.allTeams}
                  className="select-field w-full sm:max-w-xs"
                  value={teamFilter}
                  onChange={(event) => onTeamFilter(event.target.value)}
                >
                  <option value="all">
                    {AFFILIATE_COPY.commissions.allTeams}
                  </option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
              {data.sourceAffiliates.length > 0 && (
                <select
                  aria-label={AFFILIATE_COPY.commissions.allMembers}
                  className="select-field w-full sm:max-w-xs"
                  value={sourceFilter}
                  onChange={(event) => onSourceFilter(event.target.value)}
                >
                  <option value="all">
                    {AFFILIATE_COPY.commissions.allMembers}
                  </option>
                  {data.sourceAffiliates.map((affiliate) => (
                    <option key={affiliate.id} value={affiliate.id}>
                      {affiliate.displayName ?? affiliate.email}
                    </option>
                  ))}
                </select>
              )}
              {filtersActive && (
                <button
                  type="button"
                  onClick={onClearFilters}
                  className="ml-auto text-xs font-medium text-muted-foreground hover:text-foreground hover:underline"
                >
                  {AFFILIATE_COPY.commissions.clearFilters}
                </button>
              )}
            </div>
        </div>

        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b border-border/70 bg-muted/20 px-4 py-2.5 text-xs">
          <p className="text-muted-foreground">
            {data.filtered.count.toLocaleString()}{" "}
            {data.filtered.count === 1 ? "entry" : "entries"}
            {isFetching && <span> · updating…</span>}
          </p>
          <p className="font-semibold text-brand-dark">
            {AFFILIATE_COPY.commissions.columns.amount}:{" "}
            <span className="text-primary">
              {formatCurrency(data.filtered.amount)}
            </span>
          </p>
        </div>

        {data.entries.length === 0 && filtersActive ? (
          <div
            className={cn(
              "space-y-3 px-4 py-10 text-center",
              fillHeight && "flex min-h-0 flex-1 flex-col items-center justify-center"
            )}
          >
            <p className="text-sm text-muted-foreground">
              {AFFILIATE_COPY.commissions.noMatches}
            </p>
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {AFFILIATE_COPY.commissions.clearFilters}
            </Button>
          </div>
        ) : (
          <div className={cn(fillHeight && "flex min-h-0 flex-1 basis-0 flex-col")}>
            <LedgerTable
              entries={data.entries}
              showDetails
              affiliateView
              fillHeight={fillHeight}
            />
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-border bg-muted/50 px-4 py-3 text-xs text-muted-foreground">
            <p>
              Page {data.page} of {data.totalPages}
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= data.totalPages}
                onClick={() => onPageChange(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
