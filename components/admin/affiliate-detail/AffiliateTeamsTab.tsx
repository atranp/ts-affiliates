"use client";

import Link from "next/link";
import { Share2, Users } from "lucide-react";
import { TeamPanel } from "@/components/TeamPanel";
import { TeamsPanel } from "@/components/TeamsPanel";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { TeamMember } from "@/lib/admin/team";
import type { TeamSummary } from "@/lib/teams/queries";

export function AffiliateTeamsTab({
  affiliateId,
  loading,
  teams,
  legacyTeam,
  onViewTeamLedger,
}: {
  affiliateId: string;
  loading: boolean;
  teams: TeamSummary[] | undefined;
  /** Flat recruit list for sponsors whose downline predates named teams. */
  legacyTeam: TeamMember[] | undefined;
  onViewTeamLedger: (teamId: string) => void;
}) {
  if (loading) {
    return <p className="text-sm text-muted-foreground">Loading teams...</p>;
  }

  if (teams && teams.length > 0) {
    return (
      <TeamsPanel
        teams={teams}
        adminView
        sponsorAffiliateId={affiliateId}
        onViewTeamLedger={onViewTeamLedger}
      />
    );
  }

  if (legacyTeam && legacyTeam.length > 0) {
    return <TeamPanel team={legacyTeam} adminView />;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>No teams yet</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button size="sm" asChild>
          <Link href={`/admin/teams?sponsorId=${affiliateId}&create=1`}>
            <Users className="mr-2 h-4 w-4" />
            Create team
          </Link>
        </Button>
        <Button size="sm" variant="outline" asChild>
          <Link href={`/admin/deal-rules?sponsorId=${affiliateId}`}>
            <Share2 className="mr-2 h-4 w-4" />
            Add deal rule
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
