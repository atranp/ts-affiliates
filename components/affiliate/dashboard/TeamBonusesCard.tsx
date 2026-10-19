import { affiliateBadgeClass } from '@/components/affiliate/AffiliateBadge';
import { AffiliateStatCard } from '@/components/affiliate/AffiliateStatCard';
import { MilestoneProgress } from '@/components/affiliate/MilestoneProgress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AFFILIATE_COPY } from '@/lib/affiliate/copy';
import type { LedgerData } from '@/lib/ledger/types';
import { cn, formatCurrency } from '@/lib/utils';

/** Home fallback for affiliates who earn team cuts but sponsor no named team. */
export function TeamBonusesCard({
  overrideSummary,
  teamBonuses,
  onViewMember,
}: Pick<LedgerData, 'overrideSummary' | 'teamBonuses'> & {
  onViewMember: (memberId: string, status: 'unpaid' | 'paid') => void;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">
          {AFFILIATE_COPY.home.teamEarningsTitle}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <AffiliateStatCard
            label={AFFILIATE_COPY.team.teamCutUnpaid}
            value={overrideSummary.unpaidTotal}
            tone="primary"
          />
          <AffiliateStatCard
            label={AFFILIATE_COPY.team.paid}
            value={overrideSummary.paidTotal}
            tone="success"
          />
        </div>

        <div className="space-y-3">
          {teamBonuses.map((bonus) => (
            <div
              key={bonus.sourceAffiliateId}
              className="rounded-lg border border-border bg-background p-4 space-y-3"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium">
                    {bonus.displayName ?? bonus.email}
                  </p>
                  <p className="text-xs text-muted-foreground">Team member</p>
                </div>
                <div className="flex flex-wrap gap-2 text-sm">
                  {bonus.unpaidTotal > 0 && (
                    <button
                      type="button"
                      onClick={() =>
                        onViewMember(bonus.sourceAffiliateId, 'unpaid')
                      }
                      className={cn(
                        affiliateBadgeClass('unpaid'),
                        'ts-affiliate-badge-interactive',
                      )}
                    >
                      {AFFILIATE_COPY.team.teamCutUnpaid}{' '}
                      {formatCurrency(bonus.unpaidTotal)}
                    </button>
                  )}
                  {bonus.pendingTotal > 0 && (
                    <span className={affiliateBadgeClass('pending')}>
                      {AFFILIATE_COPY.team.teamCutLocked}{' '}
                      {formatCurrency(bonus.pendingTotal)}
                    </span>
                  )}
                  {bonus.paidTotal > 0 && (
                    <button
                      type="button"
                      onClick={() => onViewMember(bonus.sourceAffiliateId, 'paid')}
                      className={cn(
                        affiliateBadgeClass('paid'),
                        'ts-affiliate-badge-interactive',
                      )}
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
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
