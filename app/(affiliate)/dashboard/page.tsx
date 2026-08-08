'use client';

import { Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/components/AuthProvider';
import { AffiliateStatCard } from '@/components/affiliate/AffiliateStatCard';
import { AffiliateHomeCard } from '@/components/affiliate/primitives';
import {
  DashboardSkeleton,
  TeamsPanelSkeleton,
} from '@/components/affiliate/DashboardSkeleton';
import { MilestoneProgress } from '@/components/affiliate/MilestoneProgress';
import { CommissionsHomePreview } from '@/components/affiliate/CommissionsHomePreview';
import { TeamHomePreview } from '@/components/affiliate/TeamHomePreview';
import { CommissionsPanel } from '@/components/CommissionsPanel';
import { TeamsPanel, useTeams } from '@/components/TeamsPanel';
import { TeamPanel, useTeam } from '@/components/TeamPanel';
import { ErrorState } from '@/components/admin/ErrorState';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import {
  defaultSortDirection,
  ledgerSortParamsForUrl,
  ledgerTabToFilters,
  ledgerTypeFilterToApi,
  resolveLedgerSortDir,
  resolveLedgerSortKey,
  resolveLedgerStatusTab,
  resolveLedgerTypeFilter,
  useLedger,
  type LedgerSortKey,
  type LedgerStatusTab,
  type LedgerTypeFilter,
} from '@/hooks/use-ledger';
import type { SortDirection } from '@/lib/ledger/sort';
import { PayoutsList } from '@/components/payouts/PayoutsList';
import { apiFetch } from '@/lib/api-client';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import type { PayoutBatchListItem } from '@/lib/payouts/types';
import { cn, formatCurrency } from '@/lib/utils';
import { useMinLg } from '@/hooks/use-media-query';

type DashboardTab = 'overview' | 'ledger' | 'teams' | 'payouts';

const DASHBOARD_TABS: DashboardTab[] = [
  'overview',
  'ledger',
  'teams',
  'payouts',
];

function resolveTab(value: string | null): DashboardTab {
  if (value === 'commissions') return 'ledger';
  return DASHBOARD_TABS.find((tab) => tab === value) ?? 'overview';
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, loading: authLoading } = useAuth();

  /**
   * The URL is the single source of truth for navigation state so refreshes,
   * the back button, and shared links all land where the user expects.
   * Tab moves go into history; filter tweaks replace so they don't flood it.
   */
  const setParams = useCallback(
    (
      updates: Record<string, string | null>,
      { history = false }: { history?: boolean } = {},
    ) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      const url = query ? `${pathname}?${query}` : pathname;
      if (history) router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  const viewTab = resolveTab(searchParams.get('tab'));
  const statusParam = searchParams.get('status');
  const ledgerTab = resolveLedgerStatusTab(statusParam);
  const typeFilter = resolveLedgerTypeFilter(
    searchParams.get('type'),
    statusParam,
  );
  const sourceFilter = searchParams.get('member') ?? 'all';
  const teamFilter = searchParams.get('team') ?? 'all';
  const urlQuery = searchParams.get('q') ?? '';
  const page = Math.max(1, Number(searchParams.get('page') ?? '1') || 1);
  const sortKey = resolveLedgerSortKey(searchParams.get('sort'));
  const sortDir = resolveLedgerSortDir(searchParams.get('dir'), sortKey);

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
    }, 300);
    return () => clearTimeout(timer);
  }, [q, urlQuery, setParams]);

  const tabFilters = ledgerTabToFilters(ledgerTab, sourceFilter);

  const { data, error, isLoading, refetch, isFetching } = useLedger({
    ...tabFilters,
    type: ledgerTypeFilterToApi(typeFilter),
    q: urlQuery,
    teamId: teamFilter !== 'all' ? teamFilter : undefined,
    page,
    limit: 50,
    sortBy: sortKey,
    sortDir,
    enabled: !!user,
  });

  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    undefined,
    !!user,
  );
  const { data: legacyTeamData } = useTeam(undefined, !!user);
  const { data: payoutsData } = useQuery({
    queryKey: ['payouts'],
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>('/api/payouts'),
    enabled: !!user,
    staleTime: 60 * 1000,
  });

  const payoutsCount = payoutsData?.batches.length ?? 0;

  function setViewTab(tab: string) {
    setParams({ tab: tab === 'overview' ? null : tab }, { history: true });
  }

  function focusTeamMember(
    sourceId: string,
    status: 'unpaid' | 'paid' | 'all',
  ) {
    setParams(
      {
        tab: 'ledger',
        team: null,
        member: sourceId,
        type: status === 'all' ? 'team' : null,
        status: status === 'all' ? null : status,
        page: null,
      },
      { history: true },
    );
  }

  function focusTeam(teamId: string) {
    setParams(
      {
        tab: 'ledger',
        member: null,
        team: teamId,
        type: 'team',
        status: null,
        page: null,
      },
      { history: true },
    );
  }

  function handleTeamFilter(value: string) {
    setParams({
      team: value === 'all' ? null : value,
      // A team and a single member are mutually exclusive narrowings.
      ...(value === 'all' ? {} : { member: null }),
      page: null,
    });
  }

  function handleSourceFilter(value: string) {
    setParams({ member: value === 'all' ? null : value, page: null });
  }

  function handleTypeFilter(value: LedgerTypeFilter) {
    setParams({
      type: value === 'all' ? null : value,
      status: statusParam === 'overrides' ? null : statusParam,
      ...(value === 'direct' ? { team: null, member: null } : {}),
      page: null,
    });
  }

  function handleLedgerTab(value: LedgerStatusTab) {
    setParams({ status: value === 'all' ? null : value, page: null });
  }

  function handleLedgerPageChange(nextPage: number) {
    setParams({
      page: nextPage <= 1 ? null : String(nextPage),
    });
  }

  function handleLedgerSort(key: LedgerSortKey) {
    const nextDir =
      sortKey === key
        ? sortDir === 'asc'
          ? 'desc'
          : 'asc'
        : defaultSortDirection(key);

    handleLedgerSortChange(key, nextDir);
  }

  function handleLedgerSortChange(key: LedgerSortKey, dir: SortDirection) {
    setParams({
      ...ledgerSortParamsForUrl(key, dir),
      page: null,
    });
  }

  function clearLedgerFilters() {
    setQ('');
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
  }

  const displayName = user?.affiliateName?.trim() || user?.name?.trim() || null;
  const desktopFill = useMinLg();

  if (authLoading || (isLoading && !data)) {
    return <DashboardSkeleton />;
  }

  const hasTeams = (teamsData?.teams.length ?? 0) > 0;
  const hasTeamBonuses = (data?.teamBonuses.length ?? 0) > 0;
  const filtersActive =
    ledgerTab !== 'all' ||
    typeFilter !== 'all' ||
    sourceFilter !== 'all' ||
    teamFilter !== 'all' ||
    urlQuery !== '';

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs
          value={viewTab}
          onValueChange={setViewTab}
          className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-hidden"
        >
          <TabsContent
            value="overview"
            className="ts-affiliate-tab-scroll ts-home-overview lg:ts-affiliate-tab-fill lg:grid lg:grid-rows-[auto_auto_auto_minmax(0,1fr)] lg:gap-4 lg:space-y-0 lg:overflow-hidden lg:pb-0"
          >
            <div className="min-w-0 shrink-0">
              <h1 className="page-title">
                {displayName ? `Welcome, ${displayName}` : 'Welcome'}
              </h1>
              <p className="page-description">{AFFILIATE_COPY.home.subtitle}</p>
            </div>

            <div className="ts-home-stat-grid shrink-0">
              <AffiliateStatCard
                compact
                actionArrow
                label={AFFILIATE_COPY.stats.owed.label}
                value={data.summary.unpaidTotal}
                tone="primary"
                actionLabel={AFFILIATE_COPY.stats.owed.action}
                onAction={() => setViewTab('ledger')}
              />
              <AffiliateStatCard
                compact
                actionArrow
                label={AFFILIATE_COPY.stats.paid.label}
                value={data.summary.paidTotal}
                tone="success"
                actionLabel={AFFILIATE_COPY.stats.paid.action}
                onAction={() => setViewTab('payouts')}
              />
              <AffiliateStatCard
                compact
                actionArrow
                label={AFFILIATE_COPY.stats.payouts.label}
                value={String(payoutsCount)}
                tone="primary"
                actionLabel={AFFILIATE_COPY.stats.payouts.action}
                onAction={() => setViewTab('payouts')}
              />
            </div>

            <div className="ts-home-split shrink-0">
              <CommissionsHomePreview
                enabled={!!user}
                onViewCommissions={() => setViewTab('ledger')}
              />

              <AffiliateHomeCard
                className="flex min-h-0 flex-col"
                title={AFFILIATE_COPY.home.payoutsTitle}
                actionLabel={AFFILIATE_COPY.home.payoutsAction}
                onAction={() => setViewTab('payouts')}
              >
                <PayoutsList
                  detailHrefPrefix="/dashboard/payouts"
                  affiliateView
                  embedded
                  limit={3}
                  onViewAll={() => setViewTab('payouts')}
                />
              </AffiliateHomeCard>
            </div>

            <div className={cn(desktopFill && 'min-h-0')}>
              {teamsLoading ? (
                <AffiliateHomeCard title={AFFILIATE_COPY.home.teamsTitle}>
                  <div className="h-48 animate-pulse rounded-lg border border-border/60 bg-muted/15" />
                </AffiliateHomeCard>
              ) : hasTeams ? (
                <TeamHomePreview
                  fill={desktopFill}
                  scrollContent={desktopFill}
                  className={cn(desktopFill && 'min-h-0')}
                  teams={teamsData!.teams}
                  onViewTeam={() => setViewTab('teams')}
                  onViewTeamLedger={focusTeam}
                  onViewMember={(memberId) =>
                    focusTeamMember(memberId, 'unpaid')
                  }
                />
              ) : hasTeamBonuses ? (
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {AFFILIATE_COPY.home.teamEarningsTitle}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <AffiliateStatCard
                        label={AFFILIATE_COPY.team.payout}
                        value={data.overrideSummary.unpaidTotal}
                        tone="primary"
                      />
                      <AffiliateStatCard
                        label={AFFILIATE_COPY.team.paid}
                        value={data.overrideSummary.paidTotal}
                        tone="success"
                      />
                    </div>

                    <div className="space-y-3">
                      {data.teamBonuses.map((bonus) => {
                        const name = bonus.displayName ?? bonus.email;

                        return (
                          <div
                            key={bonus.sourceAffiliateId}
                            className="rounded-lg border border-border bg-background p-4 space-y-3"
                          >
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <p className="font-medium">{name}</p>
                                <p className="text-xs text-muted-foreground">
                                  Team member
                                </p>
                              </div>
                              <div className="flex flex-wrap gap-2 text-sm">
                                {bonus.unpaidTotal > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      focusTeamMember(
                                        bonus.sourceAffiliateId,
                                        'unpaid',
                                      )
                                    }
                                    className="rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary hover:bg-primary/15"
                                  >
                                    {AFFILIATE_COPY.team.payout}{' '}
                                    {formatCurrency(bonus.unpaidTotal)}
                                  </button>
                                )}
                                {bonus.pendingTotal > 0 && (
                                  <span className="rounded-full bg-warning/10 px-3 py-1 text-xs font-medium text-warning">
                                    {AFFILIATE_COPY.team.awaitingMilestone}{' '}
                                    {formatCurrency(bonus.pendingTotal)}
                                  </span>
                                )}
                                {bonus.paidTotal > 0 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      focusTeamMember(
                                        bonus.sourceAffiliateId,
                                        'paid',
                                      )
                                    }
                                    className="rounded-full bg-success/10 px-3 py-1 text-xs font-medium text-success hover:bg-success/15"
                                  >
                                    {AFFILIATE_COPY.team.paid}{' '}
                                    {formatCurrency(bonus.paidTotal)}
                                  </button>
                                )}
                              </div>
                            </div>

                            {bonus.milestone && (
                              <MilestoneProgress
                                current={bonus.milestone.current}
                                threshold={bonus.milestone.threshold}
                                remaining={bonus.milestone.remaining}
                                met={bonus.milestone.met}
                                compact
                              />
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </TabsContent>

          <TabsContent
            value="ledger"
            className="ts-affiliate-tab-scroll flex min-h-0 min-w-0 max-w-full flex-col gap-4 lg:ts-affiliate-tab-fill lg:gap-5"
          >
            <div className="ts-page-header shrink-0">
              <h1 className="page-title">{AFFILIATE_COPY.commissions.title}</h1>
              <p className="page-description">
                {AFFILIATE_COPY.commissions.description}
              </p>
            </div>

            <CommissionsPanel
              data={data}
              teams={teamsData?.teams}
              ledgerTab={ledgerTab}
              typeFilter={typeFilter}
              sourceFilter={sourceFilter}
              teamFilter={teamFilter}
              q={q}
              page={page}
              sortKey={sortKey}
              sortDir={sortDir}
              isFetching={isFetching}
              filtersActive={filtersActive}
              onLedgerTab={handleLedgerTab}
              onTypeFilter={handleTypeFilter}
              onTeamFilter={handleTeamFilter}
              onSourceFilter={handleSourceFilter}
              onSearchChange={setQ}
              onSort={handleLedgerSort}
              onSortChange={handleLedgerSortChange}
              onClearFilters={clearLedgerFilters}
              onPageChange={handleLedgerPageChange}
              fillHeight={desktopFill}
              className={cn('min-h-0', desktopFill && 'flex-1')}
            />
          </TabsContent>

          <TabsContent
            value="teams"
            className="ts-affiliate-tab-scroll flex min-h-0 min-w-0 max-w-full flex-col gap-3 lg:ts-affiliate-tab-fill lg:gap-5"
          >
            <div className="ts-page-header shrink-0 max-sm:px-0.5">
              <h1 className="page-title">{AFFILIATE_COPY.team.rosterTitle}</h1>
              <p className="page-description">
                {AFFILIATE_COPY.team.rosterDescription}
              </p>
            </div>
            {teamsLoading ? (
              <TeamsPanelSkeleton />
            ) : teamsData?.teams && teamsData.teams.length > 0 ? (
              <TeamsPanel
                teams={teamsData.teams}
                onViewLedger={(memberId) => focusTeamMember(memberId, 'unpaid')}
                onViewTeamLedger={focusTeam}
                fillHeight={desktopFill}
                className={cn('min-h-0', desktopFill && 'flex-1')}
              />
            ) : legacyTeamData?.team && legacyTeamData.team.length > 0 ? (
              <TeamPanel team={legacyTeamData.team} />
            ) : (
              <Card>
                <CardHeader>
                  <CardTitle>{AFFILIATE_COPY.team.title}</CardTitle>
                  <CardDescription>{AFFILIATE_COPY.team.empty}</CardDescription>
                </CardHeader>
              </Card>
            )}
          </TabsContent>

          <TabsContent
            value="payouts"
            className="ts-affiliate-tab-scroll flex min-h-0 min-w-0 max-w-full flex-col gap-3 lg:ts-affiliate-tab-fill lg:gap-5"
          >
            <div className="ts-page-header shrink-0 max-sm:px-0.5">
              <h1 className="page-title">{AFFILIATE_COPY.payouts.historyTitle}</h1>
              <p className="page-description">
                {AFFILIATE_COPY.payouts.description}
              </p>
            </div>
            <PayoutsList
              detailHrefPrefix="/dashboard/payouts"
              affiliateView
              className={cn('min-h-0', desktopFill && 'flex-1')}
            />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
