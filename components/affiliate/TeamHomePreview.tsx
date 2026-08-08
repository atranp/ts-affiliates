"use client";

import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Users } from "lucide-react";
import { useMemo } from "react";
import {
  AffiliateAmountCell,
  AffiliateCompactStat,
  AffiliateListPanel,
  AffiliateMetaLine,
  AffiliateMetaHighlight,
  AffiliateSectionLabel,
} from "@/components/affiliate/primitives";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY, memberCountLabel } from "@/lib/affiliate/copy";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import {
  countSegments,
  memberName,
  segmentOf,
  sortMembers,
  unlockedBonus,
  type MemberSegment,
} from "@/lib/teams/roster";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

const PREVIEW_MEMBER_LIMIT = 5;

type TeamHomePreviewProps = {
  teams: TeamSummary[];
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
  onViewMember: (memberId: string) => void;
};

function useTeamDetail(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["team", teamId],
    queryFn: () => apiFetch<{ team: TeamDetail }>(`/api/teams/${teamId}`),
    enabled: enabled && !!teamId,
    staleTime: 60 * 1000,
  });
}

function MemberAvatar({
  name,
  segment,
}: {
  name: string;
  segment: MemberSegment;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1",
        segment === "earning" &&
          "bg-success-soft text-emerald-800 ring-emerald-200/80",
        segment === "ramping" &&
          "bg-warning-soft text-amber-800 ring-amber-200/80",
        segment === "inactive" &&
          "bg-muted text-muted-foreground ring-border/80"
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function MilestonePreview({
  current,
  threshold,
  met,
}: {
  current: number;
  threshold: number;
  met: boolean;
}) {
  if (met) {
    return (
      <Badge variant="paid" className="gap-1 font-semibold">
        <Check className="h-3 w-3 stroke-[2.5]" aria-hidden />
        {AFFILIATE_COPY.team.goalReachedShort}
      </Badge>
    );
  }

  const percent = Math.min(100, Math.round((current / threshold) * 100));
  const barTone =
    percent >= 50 ? "bg-primary" : percent > 0 ? "bg-amber-500" : "bg-transparent";

  return (
    <div className="flex min-w-[6.5rem] items-center gap-2">
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border/80">
        <div
          className={cn("h-full rounded-full transition-all", barTone)}
          style={{ width: `${Math.max(percent, percent > 0 ? 10 : 0)}%` }}
        />
      </div>
      <span className="text-[11px] font-medium tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

function SegmentSummary({
  memberCount,
  segments,
}: {
  memberCount: number;
  segments: ReturnType<typeof countSegments> | null;
}) {
  return (
    <AffiliateMetaLine>
      <AffiliateMetaHighlight icon={Users}>
        {memberCountLabel(memberCount)}
      </AffiliateMetaHighlight>
      {segments ? (
        <>
          {segments.earning > 0 && (
            <span>
              <span className="font-semibold text-emerald-700">
                {segments.earning}
              </span>{" "}
              {AFFILIATE_COPY.team.segments.earning.toLowerCase()}
            </span>
          )}
          {segments.ramping > 0 && (
            <span>
              <span className="font-semibold text-amber-700">
                {segments.ramping}
              </span>{" "}
              {AFFILIATE_COPY.team.segments.ramping.toLowerCase()}
            </span>
          )}
          {segments.inactive > 0 && (
            <span>
              <span className="font-semibold">{segments.inactive}</span>{" "}
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
  onViewTeamLedger,
  onViewMember,
}: {
  team: TeamSummary;
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
  onViewMember: (memberId: string) => void;
}) {
  const { data, isLoading } = useTeamDetail(team.id, true);
  const members = data?.team.members;

  const segments = useMemo(
    () => (members && members.length > 0 ? countSegments(members) : null),
    [members]
  );

  const topMembers = useMemo(() => {
    if (!members) return [];
    return sortMembers(members, "revenue", "desc")
      .filter(
        (member) =>
          member.stats.totalRevenue > 0 || unlockedBonus(member) > 0
      )
      .slice(0, PREVIEW_MEMBER_LIMIT);
  }, [members]);

  const { stats } = team;

  return (
    <div className="w-full space-y-4">
      <SegmentSummary memberCount={team.memberCount} segments={segments} />

      <div className="grid w-full min-w-0 grid-cols-2 gap-3 sm:grid-cols-4">
        <AffiliateCompactStat
          label={AFFILIATE_COPY.team.readyForPayout}
          value={formatCurrency(stats.unpaidTeamBonus)}
          tone="primary"
        />
        <AffiliateCompactStat
          label={AFFILIATE_COPY.team.teamRevenue}
          value={formatCurrency(stats.totalRevenue)}
        />
        {stats.pendingTeamBonus > 0 && (
          <AffiliateCompactStat
            label={AFFILIATE_COPY.team.awaitingMilestone}
            value={formatCurrency(stats.pendingTeamBonus)}
            tone="warning"
          />
        )}
        {stats.paidTeamBonus > 0 && (
          <AffiliateCompactStat
            label={AFFILIATE_COPY.team.paid}
            value={formatCurrency(stats.paidTeamBonus)}
            tone="success"
          />
        )}
      </div>

      {isLoading ? (
        <div className="h-40 animate-pulse rounded-xl border border-border bg-muted/30" />
      ) : topMembers.length > 0 ? (
        <div>
          <AffiliateSectionLabel
            action={
              stats.unpaidTeamBonus > 0 ? (
                <button
                  type="button"
                  onClick={() => onViewTeamLedger(team.id)}
                  className="ts-text-link"
                >
                  {AFFILIATE_COPY.team.viewUnpaid}
                </button>
              ) : undefined
            }
          >
            {AFFILIATE_COPY.home.topProducers}
          </AffiliateSectionLabel>
          <AffiliateListPanel>
            <ul className="divide-y divide-border/60">
              {topMembers.map((member) => {
                const name = memberName(member);
                const segment = segmentOf(member);
                const milestone = member.stats.milestone;
                const canView = unlockedBonus(member) > 0;

                return (
                  <li key={member.id}>
                    <button
                      type="button"
                      onClick={() => canView && onViewMember(member.id)}
                      disabled={!canView}
                      className={cn(
                        "ts-list-row items-center py-3",
                        canView && "cursor-pointer",
                        !canView && "cursor-default",
                        segment === "earning" && "bg-success-soft/15",
                        segment === "ramping" && "bg-warning-soft/10"
                      )}
                    >
                      <MemberAvatar name={name} segment={segment} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-brand-dark">
                          {name}
                        </p>
                        <p className="truncate text-xs text-muted-foreground">
                          {member.stats.totalRevenue > 0
                            ? `${formatCurrency(member.stats.totalRevenue)} ${AFFILIATE_COPY.home.salesLabel.toLowerCase()}`
                            : AFFILIATE_COPY.team.segments.inactive}
                        </p>
                      </div>
                      <div className="hidden shrink-0 sm:block">
                        {milestone?.threshold ? (
                          <MilestonePreview
                            current={milestone.current}
                            threshold={milestone.threshold}
                            met={milestone.met}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground/70">
                            —
                          </span>
                        )}
                      </div>
                      {member.stats.unpaidTeamBonus > 0 ? (
                        <AffiliateAmountCell
                          amount={formatCurrency(member.stats.unpaidTeamBonus)}
                          sublabel={AFFILIATE_COPY.team.payout}
                          tone="primary"
                        />
                      ) : member.stats.pendingTeamBonus > 0 ? (
                        <AffiliateAmountCell
                          amount={formatCurrency(member.stats.pendingTeamBonus)}
                          sublabel={AFFILIATE_COPY.team.awaitingMilestone}
                          tone="warning"
                        />
                      ) : (
                        <span className="shrink-0 text-xs text-muted-foreground/70">
                          —
                        </span>
                      )}
                    </button>
                  </li>
                );
              })}
            </ul>
          </AffiliateListPanel>
        </div>
      ) : null}

      <div className="flex justify-end border-t border-border/60 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-primary"
          onClick={onViewTeam}
        >
          {AFFILIATE_COPY.home.viewFullRoster}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

function MultiTeamPreview({
  teams,
  onViewTeam,
  onViewTeamLedger,
}: {
  teams: TeamSummary[];
  onViewTeam: () => void;
  onViewTeamLedger: (teamId: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {teams.map((team) => (
          <button
            key={team.id}
            type="button"
            onClick={() => onViewTeamLedger(team.id)}
            className="rounded-xl border border-border/80 bg-muted/10 p-4 text-left transition-colors hover:border-primary/30 hover:bg-primary-soft/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <p className="font-semibold text-brand-dark">{team.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {memberCountLabel(team.memberCount)}
            </p>
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
              <p className="mt-2 text-xs text-muted-foreground">
                {AFFILIATE_COPY.team.awaitingMilestone}{" "}
                <span className="font-medium text-amber-700">
                  {formatCurrency(team.stats.pendingTeamBonus)}
                </span>
              </p>
            )}
          </button>
        ))}
      </div>
      <div className="flex justify-end border-t border-border/60 pt-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-8 gap-1 px-2 text-primary"
          onClick={onViewTeam}
        >
          {AFFILIATE_COPY.home.viewFullRoster}
          <ChevronRight className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

export function TeamHomePreview({
  teams,
  onViewTeam,
  onViewTeamLedger,
  onViewMember,
}: TeamHomePreviewProps) {
  if (teams.length === 0) return null;

  if (teams.length === 1) {
    return (
      <SingleTeamPreview
        team={teams[0]}
        onViewTeam={onViewTeam}
        onViewTeamLedger={onViewTeamLedger}
        onViewMember={onViewMember}
      />
    );
  }

  return (
    <MultiTeamPreview
      teams={teams}
      onViewTeam={onViewTeam}
      onViewTeamLedger={onViewTeamLedger}
    />
  );
}
