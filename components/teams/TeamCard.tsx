"use client";

import Link from "next/link";
import { ChevronDown, ChevronRight, ExternalLink, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TeamDetailSection } from "@/components/teams/TeamDetailSection";
import { TeamStats } from "@/components/teams/TeamStats";
import { AFFILIATE_COPY, memberCountLabel } from "@/lib/affiliate/copy";
import type { TeamSummary } from "@/lib/teams/queries";
import { cn } from "@/lib/utils";

export function OpenTeamLink({
  sponsorAffiliateId,
  teamId,
}: {
  sponsorAffiliateId: string;
  teamId: string;
}) {
  return (
    <Link
      href={`/admin/affiliates/${sponsorAffiliateId}/teams/${teamId}`}
      className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      Open team
      <ExternalLink className="h-3 w-3" />
    </Link>
  );
}

export function TeamMeta({
  team,
  affiliateView,
  adminView,
  sponsorAffiliateId,
  showAdminLink = true,
}: {
  team: TeamSummary;
  affiliateView: boolean;
  adminView: boolean;
  sponsorAffiliateId?: string;
  showAdminLink?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-start gap-3">
        <div className="ts-icon-box shrink-0 bg-primary/10 text-primary">
          <Users className="h-5 w-5" />
        </div>
        <div className="min-w-0 space-y-0.5">
          <p className="text-sm font-semibold text-brand-dark">
            {memberCountLabel(team.memberCount)}
          </p>
          <p className="text-xs text-muted-foreground">
            {affiliateView
              ? AFFILIATE_COPY.team.teamsSectionHint
              : `${team.ruleCount} active rule${team.ruleCount === 1 ? "" : "s"}`}
          </p>
        </div>
      </div>
      {adminView && sponsorAffiliateId && showAdminLink && (
        <OpenTeamLink sponsorAffiliateId={sponsorAffiliateId} teamId={team.id} />
      )}
    </div>
  );
}

export function TeamCard({
  team,
  expanded,
  onToggle,
  onViewLedger,
  onViewTeamLedger,
  adminView,
  sponsorAffiliateId,
}: {
  team: TeamSummary;
  expanded: boolean;
  onToggle: () => void;
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView: boolean;
  sponsorAffiliateId?: string;
}) {
  const affiliateView = !adminView;

  return (
    <Card className={cn(!team.active && "opacity-70")}>
      <CardHeader
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="cursor-pointer pb-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        onClick={onToggle}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget) return;
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            onToggle();
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0 text-primary" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              )}
              <span className="truncate text-brand-dark">{team.name}</span>
              {!team.active && (
                <Badge variant="secondary" className="ml-1 shrink-0">
                  {affiliateView ? AFFILIATE_COPY.team.inactive : "Inactive"}
                </Badge>
              )}
            </CardTitle>
            <p className="text-xs text-muted-foreground">
              {affiliateView
                ? memberCountLabel(team.memberCount)
                : `${team.memberCount} recruit${team.memberCount === 1 ? "" : "s"} · ${team.ruleCount} rule${team.ruleCount === 1 ? "" : "s"}`}
            </p>
          </div>
          {adminView && sponsorAffiliateId && (
            <OpenTeamLink
              sponsorAffiliateId={sponsorAffiliateId}
              teamId={team.id}
            />
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-5 pt-0">
        {expanded ? (
          <TeamDetailSection
            team={team}
            teamId={team.id}
            enabled
            affiliateView={affiliateView}
            onViewLedger={onViewLedger}
            onViewTeamLedger={onViewTeamLedger}
          />
        ) : (
          <TeamStats
            team={team}
            affiliateView={affiliateView}
            onViewTeamLedger={onViewTeamLedger}
          />
        )}
      </CardContent>
    </Card>
  );
}
