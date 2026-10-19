'use client';

import { Suspense } from 'react';
import { useAuth } from '@/components/AuthProvider';
import {
  DashboardSkeleton,
  TeamsPanelSkeleton,
} from '@/components/affiliate/DashboardSkeleton';
import {
  DashboardTabPanel,
  PanelSkeleton,
} from '@/components/affiliate/dashboard/DashboardTabPanel';
import { OverviewTab } from '@/components/affiliate/dashboard/OverviewTab';
import { CommissionsPanel } from '@/components/CommissionsPanel';
import { TeamsPanel } from '@/components/TeamsPanel';
import { TeamPanel } from '@/components/TeamPanel';
import { ErrorState } from '@/components/admin/ErrorState';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs } from '@/components/ui/tabs';
import { PayoutsList } from '@/components/payouts/PayoutsList';
import { LinksPanel } from '@/components/affiliate/LinksPanel';
import { StatsPanel } from '@/components/affiliate/StatsPanel';
import { CreativesPanel } from '@/components/affiliate/CreativesPanel';
import { CouponsPanel } from '@/components/affiliate/CouponsPanel';
import { SettingsPanel } from '@/components/affiliate/SettingsPanel';
import { PeriodPicker } from '@/components/affiliate/PeriodPicker';
import {
  useAffiliateCoupons,
  useAffiliateCreatives,
  useAffiliateLink,
  useAffiliateSettings,
  useAffiliateVisits,
  type VisitOutcomeFilter,
} from '@/hooks/use-affiliate-reach';
import { useLedger } from '@/hooks/use-ledger';
import { useLedgerUrlFilters } from '@/hooks/use-ledger-url-filters';
import { useMinLg } from '@/hooks/use-media-query';
import { useAffiliatePayouts } from '@/hooks/use-payouts';
import { usePerformance } from '@/hooks/use-performance';
import { useTeamRoster, useTeams } from '@/hooks/use-teams';
import { useUrlParams } from '@/hooks/use-url-params';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import { periodFromParams, type PeriodKey } from '@/lib/affiliate/period';
import { cn } from '@/lib/utils';

const DASHBOARD_TABS = [
  'overview',
  'links',
  'creatives',
  'coupons',
  'visits',
  'ledger',
  'teams',
  'payouts',
  'settings',
] as const;

type DashboardTab = (typeof DASHBOARD_TABS)[number];

function resolveTab(value: string | null): DashboardTab {
  if (value === 'commissions') return 'ledger';
  return DASHBOARD_TABS.find((tab) => tab === value) ?? 'overview';
}

function resolveVisitOutcome(value: string | null): VisitOutcomeFilter {
  return value === 'converted' || value === 'none' ? value : 'all';
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardPageContent />
    </Suspense>
  );
}

function DashboardPageContent() {
  const { searchParams, setParams } = useUrlParams();
  const { user, loading: authLoading } = useAuth();
  const signedIn = !!user;

  const viewTab = resolveTab(searchParams.get('tab'));

  /**
   * One period param, two defaults. Home and Traffic are reports and open on a
   * recent window; the ledger is a record and opens on everything, because an
   * affiliate looking for an order from March should find it without first
   * discovering a date filter.
   */
  const periodFallback: PeriodKey = viewTab === 'ledger' ? 'all' : 'last-30';
  const period = periodFromParams(searchParams, { fallback: periodFallback });
  const periodParams = {
    period: searchParams.get('period') ?? periodFallback,
    from: searchParams.get('from') ?? undefined,
    to: searchParams.get('to') ?? undefined,
  };

  function handlePeriodChange(next: {
    key: PeriodKey;
    from?: string;
    to?: string;
  }) {
    if (next.key === 'custom') {
      setParams({
        period: 'custom',
        from: next.from ?? null,
        to: next.to ?? null,
        page: null,
      });
      return;
    }

    // Drop the param when it matches this tab's default, so a shared URL does
    // not pin a period the sender never chose.
    setParams({
      period: next.key === periodFallback ? null : next.key,
      from: null,
      to: null,
      page: null,
    });
  }

  const ledgerFilters = useLedgerUrlFilters(
    searchParams,
    setParams,
    periodParams,
  );
  const { data, error, isLoading, refetch, isFetching } = useLedger({
    ...ledgerFilters.ledgerQuery,
    enabled: signedIn,
  });

  // Home and Traffic both read this; fetching it on either avoids a second
  // round trip when the affiliate moves between them.
  const { data: performance } = usePerformance({
    ...periodParams,
    enabled: signedIn && (viewTab === 'overview' || viewTab === 'visits'),
  });

  const { data: teamsData, isLoading: teamsLoading } = useTeams(
    undefined,
    signedIn,
  );
  const { data: legacyTeamData } = useTeamRoster(undefined, signedIn);

  // Warms the cache for the payouts tab and the home preview, which render it.
  useAffiliatePayouts(signedIn);

  // The promotional tabs fetch only once their tab is open — visits in
  // particular is the heaviest query here, and most sessions never open it.
  const visitsPage = Math.max(1, Number(searchParams.get('vp') ?? '1') || 1);
  const visitOutcome = resolveVisitOutcome(searchParams.get('clicks'));

  const { data: linkData } = useAffiliateLink(signedIn && viewTab === 'links');
  const { data: visitsData, isFetching: visitsFetching } = useAffiliateVisits(
    visitsPage,
    signedIn && viewTab === 'visits',
    visitOutcome,
  );
  const { data: creativesData } = useAffiliateCreatives(
    signedIn && viewTab === 'creatives',
  );
  const { data: couponsData } = useAffiliateCoupons(
    signedIn && viewTab === 'coupons',
  );
  const { data: settingsData } = useAffiliateSettings(
    signedIn && viewTab === 'settings',
  );

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

  const displayName = user?.affiliateName?.trim() || user?.name?.trim() || null;
  const desktopFill = useMinLg();

  if (authLoading || (isLoading && !data)) {
    return <DashboardSkeleton />;
  }

  const fillClassName = cn('min-h-0', desktopFill && 'flex-1');

  return (
    <div className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col overflow-x-hidden">
      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      {data && (
        <Tabs
          value={viewTab}
          onValueChange={setViewTab}
          className="flex min-h-0 min-w-0 max-w-full flex-1 flex-col lg:overflow-hidden"
        >
          <OverviewTab
            displayName={displayName}
            period={period}
            onPeriodChange={handlePeriodChange}
            performance={performance}
            ledger={data}
            teams={teamsData?.teams}
            teamsLoading={teamsLoading}
            enabled={signedIn}
            desktopFill={desktopFill}
            onNavigate={setViewTab}
            onViewTeamLedger={focusTeam}
            onViewMember={focusTeamMember}
          />

          <DashboardTabPanel
            value="links"
            title={AFFILIATE_COPY.links.title}
            description={AFFILIATE_COPY.links.description}
          >
            {linkData ? <LinksPanel link={linkData} /> : <PanelSkeleton />}
          </DashboardTabPanel>

          <DashboardTabPanel
            value="creatives"
            title={AFFILIATE_COPY.creatives.title}
            description={AFFILIATE_COPY.creatives.description}
          >
            {creativesData ? (
              <CreativesPanel
                creatives={creativesData.creatives}
                referralUrl={creativesData.referralUrl}
              />
            ) : (
              <PanelSkeleton />
            )}
          </DashboardTabPanel>

          <DashboardTabPanel
            value="coupons"
            title={AFFILIATE_COPY.coupons.title}
            description={AFFILIATE_COPY.coupons.description}
          >
            {couponsData ? (
              <CouponsPanel coupons={couponsData.coupons} />
            ) : (
              <PanelSkeleton />
            )}
          </DashboardTabPanel>

          {/* Visits scrolls rather than fills: stat cards, two charts and the
              click list together exceed a laptop viewport, and a fill layout
              would crush the list to nothing and clip it. */}
          <DashboardTabPanel
            value="visits"
            title={AFFILIATE_COPY.visits.title}
            description={AFFILIATE_COPY.visits.description}
            fill={false}
          >
            <PeriodPicker
              period={period}
              onChange={handlePeriodChange}
              className="shrink-0"
            />
            {visitsData ? (
              <StatsPanel
                data={visitsData}
                performance={performance}
                periodLabel={period.label}
                outcome={visitOutcome}
                onOutcomeChange={(next) =>
                  setParams({
                    clicks: next === 'all' ? null : next,
                    vp: null,
                  })
                }
                page={visitsPage}
                isFetching={visitsFetching}
                onPageChange={(next) =>
                  setParams({ vp: next <= 1 ? null : String(next) })
                }
              />
            ) : (
              <PanelSkeleton />
            )}
          </DashboardTabPanel>

          <DashboardTabPanel
            value="settings"
            title={AFFILIATE_COPY.settings.title}
            description={AFFILIATE_COPY.settings.description}
          >
            {settingsData ? (
              <SettingsPanel settings={settingsData} />
            ) : (
              <PanelSkeleton />
            )}
          </DashboardTabPanel>

          <DashboardTabPanel
            value="ledger"
            title={AFFILIATE_COPY.commissions.title}
            description={AFFILIATE_COPY.commissions.description}
          >
            <PeriodPicker
              period={period}
              onChange={handlePeriodChange}
              className="shrink-0"
            />
            <CommissionsPanel
              data={data}
              exportHref={ledgerFilters.exportHref}
              teams={teamsData?.teams}
              ledgerTab={ledgerFilters.ledgerTab}
              typeFilter={ledgerFilters.typeFilter}
              sourceFilter={ledgerFilters.sourceFilter}
              teamFilter={ledgerFilters.teamFilter}
              q={ledgerFilters.q}
              page={ledgerFilters.page}
              sortKey={ledgerFilters.sortKey}
              sortDir={ledgerFilters.sortDir}
              isFetching={isFetching}
              filtersActive={ledgerFilters.filtersActive}
              onLedgerTab={ledgerFilters.onLedgerTab}
              onTypeFilter={ledgerFilters.onTypeFilter}
              onTeamFilter={ledgerFilters.onTeamFilter}
              onSourceFilter={ledgerFilters.onSourceFilter}
              onSearchChange={ledgerFilters.onSearchChange}
              onSort={ledgerFilters.onSort}
              onSortChange={ledgerFilters.onSortChange}
              onClearFilters={ledgerFilters.onClearFilters}
              onPageChange={ledgerFilters.onPageChange}
              fillHeight={desktopFill}
              className={fillClassName}
            />
          </DashboardTabPanel>

          <DashboardTabPanel
            value="teams"
            compact
            title={AFFILIATE_COPY.team.rosterTitle}
            description={
              <>
                {AFFILIATE_COPY.team.rosterDescription}{' '}
                <span className="text-muted-foreground">
                  {AFFILIATE_COPY.team.teamsSectionHint}
                </span>
              </>
            }
          >
            {teamsLoading ? (
              <TeamsPanelSkeleton />
            ) : teamsData?.teams && teamsData.teams.length > 0 ? (
              <TeamsPanel
                teams={teamsData.teams}
                onViewLedger={(memberId) => focusTeamMember(memberId, 'unpaid')}
                onViewTeamLedger={focusTeam}
                fillHeight={desktopFill}
                className={fillClassName}
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
          </DashboardTabPanel>

          <DashboardTabPanel
            value="payouts"
            compact
            title={AFFILIATE_COPY.payouts.historyTitle}
            description={AFFILIATE_COPY.payouts.description}
          >
            <PayoutsList
              detailHrefPrefix="/dashboard/payouts"
              affiliateView
              className={fillClassName}
            />
          </DashboardTabPanel>
        </Tabs>
      )}
    </div>
  );
}
