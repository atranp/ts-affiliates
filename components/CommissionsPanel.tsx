"use client";

import { useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { AffiliateStatCard } from '@/components/affiliate/AffiliateStatCard';
import { CommissionDetailDrawer } from '@/components/affiliate/CommissionDetailDrawer';
import {
  CommissionsFilterBar,
  type CommissionsTab,
} from '@/components/affiliate/CommissionsFilterBar';
import { LedgerTable } from '@/components/LedgerTable';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import {
  filterLedgerEntriesByStatus,
  filterLedgerEntriesByType,
  type LedgerData,
  type LedgerSortKey,
  type LedgerTypeFilter,
} from '@/hooks/use-ledger';
import type { SortDirection } from '@/lib/ledger/sort';
import type { TeamSummary } from '@/lib/teams/queries';
import { cn, formatCurrency } from '@/lib/utils';
import { Button } from '@/components/ui/button';

export type { CommissionsTab };

type CommissionsPanelProps = {
  data: LedgerData;
  teams?: TeamSummary[];
  ledgerTab: CommissionsTab;
  typeFilter: LedgerTypeFilter;
  sourceFilter: string;
  teamFilter: string;
  q: string;
  page: number;
  sortKey: LedgerSortKey;
  sortDir: SortDirection;
  isFetching: boolean;
  filtersActive: boolean;
  onLedgerTab: (tab: CommissionsTab) => void;
  onTypeFilter: (value: LedgerTypeFilter) => void;
  onTeamFilter: (value: string) => void;
  onSourceFilter: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSort: (key: LedgerSortKey) => void;
  onSortChange: (key: LedgerSortKey, dir: SortDirection) => void;
  onClearFilters: () => void;
  onPageChange: (page: number) => void;
  /** URL of the CSV for the current filters; the button is hidden without it. */
  exportHref?: string;
  fillHeight?: boolean;
  className?: string;
};

export function CommissionsPanel({
  data,
  teams,
  ledgerTab,
  typeFilter,
  sourceFilter,
  teamFilter,
  q,
  page,
  sortKey,
  sortDir,
  isFetching,
  filtersActive,
  onLedgerTab,
  onTypeFilter,
  onTeamFilter,
  onSourceFilter,
  onSearchChange,
  onSort,
  onSortChange,
  onClearFilters,
  onPageChange,
  exportHref,
  fillHeight = false,
  className,
}: CommissionsPanelProps) {
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const { accountSummary, overrideAccountSummary } = data;
  const showTeamEarningsStat =
    overrideAccountSummary.unpaidTotal > 0 ||
    overrideAccountSummary.paidTotal > 0 ||
    overrideAccountSummary.pendingTotal > 0;

  const displayEntries = useMemo(
    () =>
      filterLedgerEntriesByStatus(
        filterLedgerEntriesByType(data.entries, typeFilter),
        ledgerTab,
      ),
    [data.entries, typeFilter, ledgerTab],
  );

  return (
    <>
    <div
      className={cn(
        'flex min-h-0 min-w-0 max-w-full flex-col gap-4 sm:gap-5',
        fillHeight && 'min-h-0 flex-1',
        className,
      )}
    >
      <div
        className={cn(
          'grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2 sm:gap-3',
          showTeamEarningsStat ? 'xl:grid-cols-4' : 'xl:grid-cols-3',
        )}
      >
        <AffiliateStatCard
          compact
          actionArrow={ledgerTab !== 'unpaid'}
          label={AFFILIATE_COPY.stats.owed.label}
          value={accountSummary.unpaidTotal}
          tone="primary"
          actionLabel={
            ledgerTab !== 'unpaid'
              ? AFFILIATE_COPY.commissions.tabs.payout
              : undefined
          }
          onAction={
            ledgerTab !== 'unpaid' ? () => onLedgerTab('unpaid') : undefined
          }
        />
        <AffiliateStatCard
          compact
          actionArrow={ledgerTab !== 'paid'}
          label={AFFILIATE_COPY.stats.paid.label}
          value={accountSummary.paidTotal}
          tone="success"
          actionLabel={
            ledgerTab !== 'paid'
              ? AFFILIATE_COPY.commissions.tabs.paid
              : undefined
          }
          onAction={
            ledgerTab !== 'paid' ? () => onLedgerTab('paid') : undefined
          }
        />
        {accountSummary.pendingTotal > 0 && (
          <AffiliateStatCard
            compact
            actionArrow={ledgerTab !== 'pending'}
            label={AFFILIATE_COPY.team.awaitingMilestone}
            value={accountSummary.pendingTotal}
            tone="warning"
            actionLabel={
              ledgerTab !== 'pending'
                ? AFFILIATE_COPY.commissions.tabs.awaitingMilestone
                : undefined
            }
            onAction={
              ledgerTab !== 'pending' ? () => onLedgerTab('pending') : undefined
            }
          />
        )}
        {showTeamEarningsStat && (
          <AffiliateStatCard
            compact
            actionArrow={typeFilter !== 'team'}
            label={AFFILIATE_COPY.commissions.tabs.teamEarnings}
            value={overrideAccountSummary.unpaidTotal}
            tone="primary"
            actionLabel={
              typeFilter !== 'team'
                ? AFFILIATE_COPY.commissions.tabs.teamEarnings
                : undefined
            }
            onAction={
              typeFilter !== 'team' ? () => onTypeFilter('team') : undefined
            }
          />
        )}
      </div>

      <div
        className={cn(
          'ts-table-wrap min-w-0 max-w-full max-lg:overflow-visible',
          fillHeight && 'ts-table-fill',
        )}
      >
        <CommissionsFilterBar
          data={data}
          teams={teams}
          ledgerTab={ledgerTab}
          typeFilter={typeFilter}
          sourceFilter={sourceFilter}
          teamFilter={teamFilter}
          q={q}
          sortKey={sortKey}
          sortDir={sortDir}
          filtersActive={filtersActive}
          onLedgerTab={onLedgerTab}
          onTypeFilter={onTypeFilter}
          onTeamFilter={onTeamFilter}
          onSourceFilter={onSourceFilter}
          onSearchChange={onSearchChange}
          onSortChange={onSortChange}
          onClearFilters={onClearFilters}
          exportHref={exportHref}
        />

        <div className="ts-table-summary">
          <div className="flex w-full min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
            <p className="ts-row-meta flex min-w-0 items-center gap-2">
              <span className="min-w-0 truncate">
                {data.filtered.count.toLocaleString()}{' '}
                {data.filtered.count === 1 ? 'entry' : 'entries'}
              </span>
              {isFetching ? (
                <span className="shrink-0 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                  Updating
                </span>
              ) : null}
            </p>
            <span className="ts-amount shrink-0 whitespace-nowrap text-primary">
              {formatCurrency(data.filtered.amount)}
            </span>
          </div>
          <p className="ts-row-meta mt-1 md:hidden">
            {AFFILIATE_COPY.commissions.tapForDetails}
          </p>
          <p className="ts-row-meta mt-1 hidden md:block">
            {AFFILIATE_COPY.commissions.desktopDetailHint}
          </p>
        </div>

        {displayEntries.length === 0 && filtersActive ? (
          <div
            className={cn(
              'flex flex-col items-center gap-3 px-4 py-12 text-center sm:px-5',
              fillHeight &&
                'min-h-0 flex-1 justify-center',
            )}
          >
            <div className="rounded-full bg-muted/60 p-3">
              <Search className="h-5 w-5 text-muted-foreground" aria-hidden />
            </div>
            <div className="max-w-sm space-y-1">
              <p className="text-sm font-medium text-brand-dark">
                {AFFILIATE_COPY.commissions.noMatches}
              </p>
              <p className="text-sm leading-relaxed text-muted-foreground">
                {AFFILIATE_COPY.commissions.noMatchesHint}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={onClearFilters}>
              {AFFILIATE_COPY.commissions.clearFilters}
            </Button>
          </div>
        ) : (
          <div
            className={cn(
              fillHeight &&
                'ts-table-body flex min-h-0 flex-1 flex-col overflow-hidden',
            )}
          >
            <LedgerTable
              entries={displayEntries}
              showDetails
              affiliateView
              fillHeight={fillHeight}
              sortKey={sortKey}
              sortDir={sortDir}
              onSort={onSort}
              onEntryClick={setDetailEntryId}
              isFetching={isFetching}
            />
          </div>
        )}

        {data.totalPages > 1 && (
          <div className="ts-table-footer ts-row-meta">
            <p>
              Page {data.page} of {data.totalPages}
            </p>
            <div className="ts-table-footer-actions flex gap-2">
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
    <CommissionDetailDrawer
      entryId={detailEntryId}
      onClose={() => setDetailEntryId(null)}
    />
    </>
  );
}
