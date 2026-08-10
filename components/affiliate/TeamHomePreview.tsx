'use client';

import { useQuery } from '@tanstack/react-query';
import { Users } from 'lucide-react';
import { useMemo } from 'react';
import { InlinePanelSkeleton } from '@/components/affiliate/DashboardSkeleton';
import { TeamMemberRow } from '@/components/affiliate/TeamMemberRow';
import {
  AffiliateCompactStat,
  AffiliateHomeCard,
  AffiliateMetaHighlight,
  AffiliateMetaLine,
} from '@/components/affiliate/primitives';
import { apiFetch } from '@/lib/api-client';
import { AFFILIATE_COPY, memberCountLabel } from '@/lib/affiliate/copy';
import type { TeamDetail, TeamSummary } from '@/lib/teams/queries';
import {
  countSegments,
  memberName,
  segmentOf,
  sortMembers,
  unlockedBonus,
} from '@/lib/teams/roster';
import { cn, formatCurrency } from '@/lib/utils';

const PREVIEW_MEMBER_LIMIT = 5;

type TeamHomePreviewProps = {
  teams: TeamSummary[];
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
  onViewMember: (memberId: string) => void;
};

function useTeamDetail(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ['team', teamId],
    queryFn: () => apiFetch<{ team: TeamDetail }>(`/api/teams/${teamId}`),
    enabled: enabled && !!teamId,
    staleTime: 60 * 1000,
  });
}

function SegmentSummary({
  memberCount,
  segments,
  className,
}: {
  memberCount: number;
  segments: ReturnType<typeof countSegments> | null;
  className?: string;
}) {
  return (
    <AffiliateMetaLine className={cn('leading-snug', className)}>
      <AffiliateMetaHighlight icon={Users}>
        {memberCountLabel(memberCount)}
      </AffiliateMetaHighlight>
      {segments ? (
        <>
          {segments.earning > 0 && (
            <span>
              <span className="font-medium text-emerald-700">
                {segments.earning}
              </span>{' '}
              {AFFILIATE_COPY.team.segments.earning.toLowerCase()}
            </span>
          )}
          {segments.ramping > 0 && (
            <span>
              <span className="font-medium text-amber-700">
                {segments.ramping}
              </span>{' '}
              {AFFILIATE_COPY.team.segments.ramping.toLowerCase()}
            </span>
          )}
          {segments.inactive > 0 && (
            <span>
              <span className="font-medium">{segments.inactive}</span>{' '}
              {AFFILIATE_COPY.team.segments.inactive.toLowerCase()}
            </span>
          )}
        </>
      ) : null}
    </AffiliateMetaLine>
  );
}

function SingleTeamPreview({
  team,
  onViewTeam,
  onViewMember,
  fill = false,
  scrollContent = false,
  className,
}: {
  team: TeamSummary;
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
  onViewMember: (memberId: string) => void;
  fill?: boolean;
  scrollContent?: boolean;
  className?: string;
}) {
  const { data, isLoading } = useTeamDetail(team.id, true);
  const members = data?.team.members;

  const segments = useMemo(
    () => (members && members.length > 0 ? countSegments(members) : null),
    [members],
  );

  const topMembers = useMemo(() => {
    if (!members) return [];
    return sortMembers(members, 'revenue', 'desc')
      .filter(
        (member) => member.stats.totalRevenue > 0 || unlockedBonus(member) > 0,
      )
      .slice(0, PREVIEW_MEMBER_LIMIT);
  }, [members]);

  return (
    <AffiliateHomeCard
      fill={fill}
      scrollContent={scrollContent}
      className={cn('flex min-h-0 flex-col', className)}
      title={AFFILIATE_COPY.home.teamsTitle}
      description={
        <SegmentSummary memberCount={team.memberCount} segments={segments} />
      }
      actionLabel={AFFILIATE_COPY.home.teamsAction}
      onAction={onViewTeam}
      contentClassName="p-0"
    >
      {isLoading ? (
        <div className="px-4 py-4 sm:px-5">
          <InlinePanelSkeleton className="h-40" />
        </div>
      ) : topMembers.length > 0 ? (
        <ul className="ts-divider-list">
          {topMembers.map((member) => {
            const name = memberName(member);
            const milestone = member.stats.milestone;
            const canView = unlockedBonus(member) > 0;

            return (
              <li key={member.id}>
                <TeamMemberRow
                  layout="flat"
                  name={name}
                  milestone={
                    milestone?.threshold
                      ? {
                          current: milestone.current,
                          threshold: milestone.threshold,
                          met: milestone.met,
                        }
                      : null
                  }
                  unpaidAmount={member.stats.unpaidTeamBonus}
                  pendingAmount={member.stats.pendingTeamBonus}
                  segment={segmentOf(member)}
                  onClick={
                    canView ? () => onViewMember(member.id) : undefined
                  }
                  disabled={!canView}
                />
              </li>
            );
          })}
        </ul>
      ) : null}
    </AffiliateHomeCard>
  );
}

function MultiTeamPreview({
  teams,
  onViewTeam,
  onViewTeamLedger,
  fill = false,
  scrollContent = false,
  className,
}: {
  teams: TeamSummary[];
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
  fill?: boolean;
  scrollContent?: boolean;
  className?: string;
}) {
  const totalMembers = teams.reduce((sum, team) => sum + team.memberCount, 0);

  return (
    <AffiliateHomeCard
      fill={fill}
      scrollContent={scrollContent}
      className={cn('flex min-h-0 flex-col', className)}
      title={AFFILIATE_COPY.home.teamsTitle}
      description={
        <AffiliateMetaLine className="leading-snug">
          <AffiliateMetaHighlight icon={Users}>
            {memberCountLabel(totalMembers)}
          </AffiliateMetaHighlight>
        </AffiliateMetaLine>
      }
      actionLabel={AFFILIATE_COPY.home.teamsAction}
      onAction={onViewTeam}
      contentClassName="p-4 sm:p-5"
    >
    <div className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-1 sm:gap-2">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onViewTeamLedger(team.id)}
            className="rounded-xl border border-border/50 bg-muted/10 p-3.5 text-left transition-colors hover:border-primary/20 hover:bg-muted/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="ts-row-title">{team.name}</p>
            <p className="ts-row-meta mt-1">{memberCountLabel(team.memberCount)}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <AffiliateCompactStat
                label={AFFILIATE_COPY.team.readyForPayout}
                value={formatCurrency(team.stats.unpaidTeamBonus)}
                tone="primary"
              />
              <AffiliateCompactStat
                label={AFFILIATE_COPY.team.teamRevenue}
                value={formatCurrency(team.stats.totalRevenue)}
              />
            </div>
            {team.stats.pendingTeamBonus > 0 && (
              <p className="ts-row-meta mt-2">
                {AFFILIATE_COPY.team.awaitingMilestone}{' '}
                <span className="font-medium text-amber-700">
                  {formatCurrency(team.stats.pendingTeamBonus)}
                </span>
              </p>
            )}
          </button>
        ))}
      </div>
    </div>
    </AffiliateHomeCard>
  );
}

export function TeamHomePreview({
  teams,
  onViewTeam,
  onViewTeamLedger,
  onViewMember,
  fill = false,
  scrollContent = false,
  className,
}: TeamHomePreviewProps & {
  fill?: boolean;
  scrollContent?: boolean;
  className?: string;
}) {
  if (teams.length === 0) return null;

  if (teams.length === 1) {
    return (
      <SingleTeamPreview
        team={teams[0]}
        onViewTeam={onViewTeam}
        onViewTeamLedger={onViewTeamLedger}
        onViewMember={onViewMember}
        fill={fill}
        scrollContent={scrollContent}
        className={className}
      />
    );
  }

  return (
    <MultiTeamPreview
      teams={teams}
      onViewTeam={onViewTeam}
      onViewTeamLedger={onViewTeamLedger}
      fill={fill}
      scrollContent={scrollContent}
      className={className}
    />
  );
}
