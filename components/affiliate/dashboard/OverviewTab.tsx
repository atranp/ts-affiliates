'use client';

import type { ComponentProps } from 'react';
import { AffiliateStatCard } from '@/components/affiliate/AffiliateStatCard';
import { AffiliateHomeCard } from '@/components/affiliate/primitives';
import { CommissionsHomePreview } from '@/components/affiliate/CommissionsHomePreview';
import { PayoutsHomePreview } from '@/components/affiliate/PayoutsHomePreview';
import { TeamHomePreview } from '@/components/affiliate/TeamHomePreview';
import { PeriodPicker } from '@/components/affiliate/PeriodPicker';
import { EarningsTrend } from '@/components/affiliate/PerformanceCharts';
import { TabsContent } from '@/components/ui/tabs';
import { TeamBonusesCard } from '@/components/affiliate/dashboard/TeamBonusesCard';
import { percentChange, type PerformanceResponse } from '@/hooks/use-performance';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import type { ResolvedPeriod } from '@/lib/affiliate/period';
import type { LedgerData } from '@/lib/ledger/types';
import type { TeamSummary } from '@/lib/teams/queries';
import { cn } from '@/lib/utils';

type PerformanceMetric =
  | 'earnings'
  | 'revenue'
  | 'clicks'
  | 'sales'
  | 'conversionRate';

const countOf = (value: number | undefined) =>
  value === undefined ? '—' : value.toLocaleString('en-US');

const rateOf = (value: number | null | undefined) =>
  value === null || value === undefined ? '—' : `${value.toFixed(1)}%`;

/**
 * Movement on one metric. Null whenever the comparison would be invented
 * rather than measured — an unbounded period, or a baseline of zero.
 */
function periodDelta(
  performance: PerformanceResponse | undefined,
  key: PerformanceMetric,
): number | null {
  const current = performance?.current[key];
  const previous = performance?.previous?.[key];
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  return percentChange(current, previous);
}

export function OverviewTab({
  displayName,
  period,
  onPeriodChange,
  performance,
  ledger,
  teams,
  teamsLoading,
  enabled,
  desktopFill,
  onNavigate,
  onViewTeamLedger,
  onViewMember,
}: {
  displayName: string | null;
  period: ResolvedPeriod;
  onPeriodChange: ComponentProps<typeof PeriodPicker>['onChange'];
  performance: PerformanceResponse | undefined;
  ledger: LedgerData;
  teams: TeamSummary[] | undefined;
  teamsLoading: boolean;
  enabled: boolean;
  desktopFill: boolean;
  onNavigate: (tab: 'ledger' | 'payouts' | 'teams') => void;
  onViewTeamLedger: (teamId: string) => void;
  onViewMember: (memberId: string, status: 'unpaid' | 'paid') => void;
}) {
  const delta = (key: PerformanceMetric) => periodDelta(performance, key);

  return (
    <TabsContent value="overview" className="ts-affiliate-tab-scroll ts-home-overview">
      <div className="min-w-0 shrink-0">
        <h1 className="page-title">
          {displayName ? `Welcome, ${displayName}` : 'Welcome'}
        </h1>
        <p className="page-description">{AFFILIATE_COPY.home.subtitle}</p>
      </div>

      <PeriodPicker period={period} onChange={onPeriodChange} />

      <div className="ts-home-stat-grid-wide shrink-0">
        <AffiliateStatCard
          compact
          label={AFFILIATE_COPY.performance.earnings}
          value={performance?.current.earnings ?? 0}
          tone="primary"
          delta={delta('earnings')}
        />
        <AffiliateStatCard
          compact
          label={AFFILIATE_COPY.performance.revenueGenerated}
          value={performance?.current.revenue ?? 0}
          delta={delta('revenue')}
        />
        <AffiliateStatCard
          compact
          actionArrow
          label={AFFILIATE_COPY.performance.readyForPayout}
          value={ledger.accountSummary.unpaidTotal}
          tone="success"
          actionLabel={AFFILIATE_COPY.stats.owed.action}
          onAction={() => onNavigate('ledger')}
        />
        <AffiliateStatCard
          compact
          label={AFFILIATE_COPY.performance.clicks}
          value={countOf(performance?.current.clicks)}
          delta={delta('clicks')}
        />
        <AffiliateStatCard
          compact
          label={AFFILIATE_COPY.performance.sales}
          value={countOf(performance?.current.sales)}
          delta={delta('sales')}
        />
        <AffiliateStatCard
          compact
          label={AFFILIATE_COPY.performance.conversion}
          value={rateOf(performance?.current.conversionRate)}
          delta={delta('conversionRate')}
        />
      </div>

      <AffiliateHomeCard
        className="shrink-0"
        title={AFFILIATE_COPY.performance.earningsTrendTitle}
        description={`${AFFILIATE_COPY.performance.earningsTrendDescription} · ${period.label}`}
      >
        {performance ? (
          <EarningsTrend daily={performance.daily} />
        ) : (
          <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
        )}
      </AffiliateHomeCard>

      <div className="ts-home-split shrink-0">
        <CommissionsHomePreview
          enabled={enabled}
          onViewCommissions={() => onNavigate('ledger')}
        />
        <PayoutsHomePreview
          enabled={enabled}
          onViewPayouts={() => onNavigate('payouts')}
        />
      </div>

      <div className={cn('ts-home-teams', desktopFill && 'min-h-0')}>
        {teamsLoading ? (
          <AffiliateHomeCard title={AFFILIATE_COPY.home.teamsTitle}>
            <div className="h-48 animate-pulse rounded-lg border border-border/60 bg-muted/15" />
          </AffiliateHomeCard>
        ) : teams && teams.length > 0 ? (
          <TeamHomePreview
            fill={false}
            scrollContent={false}
            className={cn(desktopFill && 'min-h-0')}
            teams={teams}
            onViewTeam={() => onNavigate('teams')}
            onViewTeamLedger={onViewTeamLedger}
            onViewMember={(memberId) => onViewMember(memberId, 'unpaid')}
          />
        ) : ledger.teamBonuses.length > 0 ? (
          <TeamBonusesCard
            overrideSummary={ledger.overrideSummary}
            teamBonuses={ledger.teamBonuses}
            onViewMember={onViewMember}
          />
        ) : null}
      </div>
    </TabsContent>
  );
}
