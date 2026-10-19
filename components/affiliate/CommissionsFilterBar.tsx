'use client';

import { useMemo } from 'react';
import { Download, Search, X } from 'lucide-react';
import { LedgerFilterSelect } from '@/components/affiliate/LedgerFilterSelect';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import type {
  LedgerData,
  LedgerSortKey,
  LedgerTypeFilter,
} from '@/hooks/use-ledger';
import type { SortDirection } from '@/lib/ledger/sort';
import type { TeamSummary } from '@/lib/teams/queries';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';

export type CommissionsTab = 'all' | 'unpaid' | 'paid' | 'pending';

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
    key: 'lifetime',
    label: AFFILIATE_COPY.commissions.typeLifetime,
    countKey: 'lifetime',
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
      className="inline-flex items-center gap-1 rounded-full border-0 bg-muted/60 px-2.5 py-1 text-xs font-medium text-foreground transition-colors hover:bg-muted"
      aria-label={`${AFFILIATE_COPY.commissions.filters.removeFilter}: ${label}`}
    >
      {label}
      <X className="h-3 w-3 opacity-60" />
    </button>
  );
}

export function CommissionsFilterBar({
  data,
  teams,
  ledgerTab,
  typeFilter,
  sourceFilter,
  teamFilter,
  q,
  sortKey,
  sortDir,
  filtersActive,
  onLedgerTab,
  onTypeFilter,
  onTeamFilter,
  onSourceFilter,
  onSearchChange,
  onSortChange,
  onClearFilters,
  exportHref,
}: {
  data: LedgerData;
  teams?: TeamSummary[];
  ledgerTab: CommissionsTab;
  typeFilter: LedgerTypeFilter;
  sourceFilter: string;
  teamFilter: string;
  q: string;
  sortKey: LedgerSortKey;
  sortDir: SortDirection;
  filtersActive: boolean;
  onLedgerTab: (tab: CommissionsTab) => void;
  onTypeFilter: (value: LedgerTypeFilter) => void;
  onTeamFilter: (value: string) => void;
  onSourceFilter: (value: string) => void;
  onSearchChange: (value: string) => void;
  onSortChange: (key: LedgerSortKey, dir: SortDirection) => void;
  onClearFilters: () => void;
  exportHref?: string;
}) {
  const { tabCounts } = data;
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

        <div className="flex min-w-0 items-end gap-2 sm:justify-end">
          <div className="relative min-w-0 flex-1 sm:w-64 sm:max-w-xs sm:flex-none">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={AFFILIATE_COPY.commissions.searchPlaceholder}
              className="ts-input pl-9"
              aria-label={AFFILIATE_COPY.commissions.searchPlaceholder}
            />
          </div>

          {exportHref ? (
            <a
              href={exportHref}
              download
              className="inline-flex h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-input bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Download className="h-3.5 w-3.5" aria-hidden />
              {AFFILIATE_COPY.commissions.exportCsv}
            </a>
          ) : null}
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
  );
}
