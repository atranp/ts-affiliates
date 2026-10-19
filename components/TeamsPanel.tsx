"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { OpenTeamLink, TeamCard, TeamMeta } from "@/components/teams/TeamCard";
import { TeamDetailSection } from "@/components/teams/TeamDetailSection";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { isSlicewpDownlineTeam } from "@/lib/teams/constants";
import type { TeamSummary } from "@/lib/teams/queries";
import { cn } from "@/lib/utils";

export function TeamsPanel({
  teams,
  onViewLedger,
  onViewTeamLedger,
  adminView = false,
  sponsorAffiliateId,
  fillHeight = false,
  className,
}: {
  teams: TeamSummary[];
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView?: boolean;
  sponsorAffiliateId?: string;
  /** Stretch the member table to the remaining viewport height. */
  fillHeight?: boolean;
  className?: string;
}) {
  const affiliateView = !adminView;
  const [expandedId, setExpandedId] = useState<string | null>(null);

  if (teams.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{AFFILIATE_COPY.team.title}</CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          {AFFILIATE_COPY.team.empty}
        </CardContent>
      </Card>
    );
  }

  if (teams.length === 1) {
    const team = teams[0];
    const showName =
      !affiliateView ||
      !isSlicewpDownlineTeam({ slicewpKey: team.slicewpKey ?? null });

    if (affiliateView) {
      return (
        <section
          className={cn(
            "flex min-h-0 min-w-0 max-w-full flex-col gap-3 sm:gap-5",
            fillHeight && "min-h-0 flex-1",
            className
          )}
        >
          <TeamDetailSection
            team={team}
            teamId={team.id}
            enabled
            affiliateView
            onViewLedger={onViewLedger}
            onViewTeamLedger={onViewTeamLedger}
            fillHeight={fillHeight}
          />
        </section>
      );
    }

    return (
      <section
        className={cn(
          "ts-panel",
          fillHeight && "flex min-h-0 flex-1 basis-0 flex-col",
          className
        )}
      >
        {showName && (
          <div className="ts-panel-header shrink-0">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1">
                <h2 className="ts-section-title flex items-center gap-2 text-base">
                  <span className="truncate">{team.name}</span>
                  {!team.active && (
                    <Badge variant="secondary" className="shrink-0">
                      {affiliateView
                        ? AFFILIATE_COPY.team.inactive
                        : "Inactive"}
                    </Badge>
                  )}
                </h2>
              </div>
              {adminView && sponsorAffiliateId && (
                <OpenTeamLink
                  sponsorAffiliateId={sponsorAffiliateId}
                  teamId={team.id}
                />
              )}
            </div>
          </div>
        )}

        <div
          className={cn(
            "ts-panel-body",
            fillHeight
              ? "flex min-h-0 flex-1 basis-0 flex-col gap-6"
              : "space-y-6"
          )}
        >
          <div className={cn(fillHeight && "shrink-0")}>
            <TeamMeta
              team={team}
              affiliateView={affiliateView}
              adminView={adminView}
              sponsorAffiliateId={sponsorAffiliateId}
              showAdminLink={!showName}
            />
          </div>

          <TeamDetailSection
            team={team}
            teamId={team.id}
            enabled
            affiliateView={affiliateView}
            onViewLedger={onViewLedger}
            onViewTeamLedger={onViewTeamLedger}
            fillHeight={fillHeight}
          />
        </div>
      </section>
    );
  }

  return (
    <div className="space-y-4">
      {teams.map((team) => (
        <TeamCard
          key={team.id}
          team={team}
          expanded={expandedId === team.id}
          onToggle={() =>
            setExpandedId((current) => (current === team.id ? null : team.id))
          }
          onViewLedger={onViewLedger}
          onViewTeamLedger={onViewTeamLedger}
          adminView={adminView}
          sponsorAffiliateId={sponsorAffiliateId}
        />
      ))}
    </div>
  );
}
