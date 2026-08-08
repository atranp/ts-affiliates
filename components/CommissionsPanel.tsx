'use client';

import { useMemo } from 'react';
import { Search, X } from 'lucide-react';
import { AffiliateStatCard } from '@/components/affiliate/AffiliateStatCard';
import { LedgerFilterSelect } from '@/components/affiliate/LedgerFilterSelect';
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
import { Input } from '@/components/ui/input';

export type CommissionsTab = 'all' | 'unpaid' | 'paid' | 'pending';

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
  fillHeight?: boolean;
  className?: string;
};

const TYPE_OPTIONS: Array<{
  key: LedgerTypeFilter;
  label: string;
  countKey: keyof LedgerData['tabCounts'];
}> = [
  { key: 'all', label: AFFILIATE_COPY.commissions.allTypes, countKey: 'all' },
  {
    key: 'direct',
    label: AFFILIATE_COPY.commissions.typeDirect,
    countKey: 'direct',
  },
  {
    key: 'team',
    label: AFFILIATE_COPY.commissions.typeTeam,
    countKey: 'overrides',
  },
];

const STATUS_OPTIONS: Array<{
  key: CommissionsTab;
  label: string;
  countKey: keyof LedgerData['tabCounts'];
}> = [
  {
    key: 'all',
    label: AFFILIATE_COPY.commissions.allStatuses,
    countKey: 'all',
  },
  {
    key: 'unpaid',
    label: AFFILIATE_COPY.commissions.tabs.payout,
    countKey: 'unpaid',
  },
  {
    key: 'paid',
    label: AFFILIATE_COPY.commissions.tabs.paid,
    countKey: 'paid',
  },
  {
    key: 'pending',
    label: AFFILIATE_COPY.commissions.tabs.awaitingMilestone,
    countKey: 'pending',
  },
];

const MOBILE_SORT_OPTIONS: Array<{
  value: `${LedgerSortKey}:${SortDirection}`;
  label: string;
}> = [
  {
    value: 'date:desc',
    label: AFFILIATE_COPY.commissions.filters.sortNewest,
  },
  {
    value: 'date:asc',
    label: AFFILIATE_COPY.commissions.filters.sortOldest,
  },
  {
    value: 'amount:desc',
    label: AFFILIATE_COPY.commissions.filters.sortAmountHigh,
  },
  {
    value: 'amount:asc',
    label: AFFILIATE_COPY.commissions.filters.sortAmountLow,
  },
  {
    value: 'sale:desc',
    label: AFFILIATE_COPY.commissions.filters.sortSaleHigh,
  },
];

function FilterPill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/50 px-2.5 py-1 text-xs text-foreground transition-colors hover:bg-muted"
      aria-label={`${AFFILIATE_COPY.commissions.filters.removeFilter}: ${label}`}
    >
      {label}
      <X className="h-3 w-3 opacity-60" />
    </button>
  );
}

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
  fillHeight = false,
  className,
}: CommissionsPanelProps) {
  const { accountSummary, overrideAccountSummary, tabCounts } = data;
  const showTeamEarningsStat =
    overrideAccountSummary.unpaidTotal > 0 ||
    overrideAccountSummary.paidTotal > 0 ||
    overrideAccountSummary.pendingTotal > 0;

  const selectedTeam = teams?.find((team) => team.id === teamFilter);
  const selectedMember = data.sourceAffiliates.find(
    (affiliate) => affiliate.id === sourceFilter,
  );
  const trimmedQuery = q.trim();

  const visibleStatusOptions = STATUS_OPTIONS.filter(
    (option) => option.key !== 'pending' || tabCounts.pending > 0,
  );

  const activeFilterPills = [
    trimmedQuery
      ? {
          key: 'search',
          label: `"${trimmedQuery.length > 24 ? `${trimmedQuery.slice(0, 24)}…` : trimmedQuery}"`,
          onRemove: () => onSearchChange(''),
        }
      : null,
    teamFilter !== 'all' && selectedTeam
      ? {
          key: 'team',
          label: selectedTeam.name,
          onRemove: () => onTeamFilter('all'),
        }
      : null,
    sourceFilter !== 'all' && selectedMember
      ? {
          key: 'member',
          label:
            selectedMember.displayName?.trim() ||
            selectedMember.email ||
            AFFILIATE_COPY.commissions.allMembers,
          onRemove: () => onSourceFilter('all'),
        }
      : null,
  ].filter(Boolean) as Array<{
    key: string;
    label: string;
    onRemove: () => void;
  }>;

  const displayEntries = useMemo(
    () =>
      filterLedgerEntriesByStatus(
        filterLedgerEntriesByType(data.entries, typeFilter),
        ledgerTab,
      ),
    [data.entries, typeFilter, ledgerTab],
  );

  const mobileSortValue =
    `${sortKey}:${sortDir}` as `${LedgerSortKey}:${SortDirection}`;
  const mobileSortOptions = useMemo(() => {
    const presetOptions = MOBILE_SORT_OPTIONS.map((option) => ({
      value: option.value,
      label: option.label,
    }));
    if (presetOptions.some((option) => option.value === mobileSortValue)) {
      return presetOptions;
    }
    const columnLabel =
      AFFILIATE_COPY.commissions.columns[
        sortKey as keyof typeof AFFILIATE_COPY.commissions.columns
      ] ?? sortKey;
    return [
      {
        value: mobileSortValue,
        label: `${columnLabel} (${sortDir === 'asc' ? 'A→Z' : 'Z→A'})`,
      },
      ...presetOptions,
    ];
  }, [mobileSortValue, sortKey, sortDir]);

  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 max-w-full flex-col gap-4 sm:gap-5',
        fillHeight && 'min-h-0 flex-1',
        className,
      )}
    >
      <div
        className={cn(
          'hidden shrink-0 gap-2.5 sm:grid lg:grid-cols-2 lg:gap-3',
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
        <div className="ts-table-toolbar shrink-0 space-y-3">
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2.5">
              <LedgerFilterSelect
                ariaLabel={AFFILIATE_COPY.commissions.filters.statusLabel}
                value={ledgerTab}
                onChange={onLedgerTab}
                className="min-w-0 sm:min-w-[10.5rem]"
                options={visibleStatusOptions.map((option) => ({
                  value: option.key,
                  label: option.label,
                  count: tabCounts[option.countKey],
                }))}
              />
              <LedgerFilterSelect
                ariaLabel={AFFILIATE_COPY.commissions.filters.typeLabel}
                value={typeFilter}
                onChange={onTypeFilter}
                className="min-w-0 sm:min-w-[10.5rem]"
                options={TYPE_OPTIONS.map((option) => ({
                  value: option.key,
                  label: option.label,
                  count: tabCounts[option.countKey],
                }))}
              />
              <LedgerFilterSelect
                ariaLabel={AFFILIATE_COPY.commissions.filters.sortLabel}
                value={mobileSortValue}
                onChange={(value) => {
                  const [key, dir] = value.split(':') as [
                    LedgerSortKey,
                    SortDirection,
                  ];
                  onSortChange(key, dir);
                }}
                className="min-w-0 md:hidden sm:min-w-[10.5rem]"
                options={mobileSortOptions}
              />
            </div>

            <div className="relative min-w-0 w-full sm:max-w-xs">
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

          {filtersActive && (
            <div
              className={cn(
                'flex flex-wrap items-center gap-2 border-t border-border/60 pt-3',
                activeFilterPills.length === 0 && 'justify-end',
              )}
            >
              {activeFilterPills.map((pill) => (
                <FilterPill
                  key={pill.key}
                  label={pill.label}
                  onRemove={pill.onRemove}
                />
              ))}
              <button
                type="button"
                onClick={onClearFilters}
                className={cn(
                  'ts-text-link',
                  activeFilterPills.length > 0 ? 'ml-auto' : '',
                )}
              >
                {AFFILIATE_COPY.commissions.clearFilters}
              </button>
            </div>
          )}
        </div>

        <div className="ts-table-summary">
          <p className="ts-row-meta flex w-full min-w-0 items-center justify-between gap-2">
            <span className="min-w-0 truncate">
              {data.filtered.count.toLocaleString()}{' '}
              {data.filtered.count === 1 ? 'entry' : 'entries'}
              {isFetching && (
                <span className="text-muted-foreground/70"> · updating…</span>
              )}
            </span>
            <span className="ts-amount shrink-0 whitespace-nowrap text-primary">
              {formatCurrency(data.filtered.amount)}
            </span>
          </p>
        </div>

        {displayEntries.length === 0 && filtersActive ? (
          <div
            className={cn(
              'space-y-3 px-4 py-10 text-center',
              fillHeight &&
                'flex min-h-0 flex-1 flex-col items-center justify-center',
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
  );
}
