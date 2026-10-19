"use client";

import { Clock, DollarSign, Target, TrendingUp } from "lucide-react";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import { teamWideRules } from "@/lib/teams/roster";
import { cn } from "@/lib/utils";

type TeamRule = TeamDetail["rules"][number];

export function TeamStats({
  team,
  affiliateView,
  onViewTeamLedger,
  sharedRules = [],
  hideOnMobile = false,
}: {
  team: TeamSummary;
  affiliateView: boolean;
  onViewTeamLedger?: (teamId: string) => void;
  sharedRules?: TeamRule[];
  hideOnMobile?: boolean;
}) {
  const { totalRevenue, unpaidTeamBonus, pendingTeamBonus } = team.stats;

  const dealRules = teamWideRules(sharedRules);

  return (
    <div
      className={cn(
        "grid gap-2.5 lg:grid-cols-2 lg:gap-3 xl:grid-cols-4",
        hideOnMobile && "hidden sm:grid"
      )}
    >
      <AffiliateStatCard
        compact={affiliateView}
        label={affiliateView ? AFFILIATE_COPY.team.readyForPayout : "Unpaid"}
        value={unpaidTeamBonus}
        tone="primary"
        icon={DollarSign}
        actionLabel={
          onViewTeamLedger && unpaidTeamBonus > 0
            ? affiliateView
              ? AFFILIATE_COPY.team.viewUnpaid
              : "View unpaid"
            : undefined
        }
        onAction={
          onViewTeamLedger && unpaidTeamBonus > 0
            ? () => onViewTeamLedger(team.id)
            : undefined
        }
      />
      <AffiliateStatCard
        compact={affiliateView}
        label={
          affiliateView ? AFFILIATE_COPY.team.teamRevenue : "Team revenue"
        }
        value={totalRevenue}
        tone="primary"
        icon={TrendingUp}
      />
      {pendingTeamBonus > 0 && (
        <AffiliateStatCard
          compact={affiliateView}
          label={AFFILIATE_COPY.team.awaitingMilestone}
          value={pendingTeamBonus}
          tone="warning"
          icon={Clock}
        />
      )}
      {dealRules.map((rule) => (
        <AffiliateStatCard
          key={rule.id}
          compact={affiliateView}
          label={AFFILIATE_COPY.team.teamDeal}
          value={`${rule.ratePercent}%`}
          tone="primary"
          icon={Target}
        />
      ))}
    </div>
  );
}
