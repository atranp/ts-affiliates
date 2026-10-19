"use client";

import { InlinePanelSkeleton } from "@/components/affiliate/DashboardSkeleton";
import { TeamRoster } from "@/components/teams/TeamRoster";
import { TeamStats } from "@/components/teams/TeamStats";
import { useTeamDetail } from "@/hooks/use-teams";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { TeamSummary } from "@/lib/teams/queries";
import { cn } from "@/lib/utils";

export function TeamDetailSection({
  team,
  teamId,
  enabled,
  affiliateView,
  onViewLedger,
  onViewTeamLedger,
  fillHeight = false,
  showStats = true,
}: {
  team: TeamSummary;
  teamId: string;
  enabled: boolean;
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  fillHeight?: boolean;
  showStats?: boolean;
}) {
  const { data, isLoading } = useTeamDetail(teamId, enabled);

  if (!enabled) return null;

  const sharedRules = data?.team.rules ?? [];

  return (
    <div
      className={cn(
        fillHeight ? "flex min-h-0 flex-1 basis-0 flex-col gap-3 sm:gap-5" : "space-y-3 sm:space-y-5"
      )}
    >
      {showStats && (
        <div className={cn(fillHeight && "shrink-0")}>
          <TeamStats
            team={team}
            affiliateView={affiliateView}
            onViewTeamLedger={onViewTeamLedger}
            sharedRules={sharedRules}
          />
        </div>
      )}

      {isLoading ? (
        <InlinePanelSkeleton
          className={fillHeight ? "min-h-[16rem] flex-1" : "h-64"}
        />
      ) : !data || data.team.members.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
          <p className="text-sm font-medium text-brand-dark">
            {affiliateView ? AFFILIATE_COPY.team.empty : "No recruits yet."}
          </p>
        </div>
      ) : (
        <div className={cn(fillHeight && "flex min-h-0 flex-1 basis-0 flex-col")}>
          <TeamRoster
            members={data.team.members}
            affiliateView={affiliateView}
            onViewLedger={onViewLedger}
            fillHeight={fillHeight}
          />
        </div>
      )}
    </div>
  );
}
