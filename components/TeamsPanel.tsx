"use client";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { apiFetch } from "@/lib/api-client";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function useTeams(affiliateId?: string, enabled = true) {
  const url = affiliateId
    ? `/api/teams?affiliateId=${affiliateId}`
    : "/api/teams";

  return useQuery({
    queryKey: ["teams", affiliateId ?? "self"],
    queryFn: () => apiFetch<{ teams: TeamSummary[] }>(url),
    enabled,
    staleTime: 60 * 1000,
  });
}

function useTeamDetail(teamId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: ["team", teamId],
    queryFn: () => apiFetch<{ team: TeamDetail }>(`/api/teams/${teamId}`),
    enabled: enabled && !!teamId,
    staleTime: 60 * 1000,
  });
}

function TeamMemberRow({
  member,
  onViewLedger,
}: {
  member: TeamDetail["members"][number];
  onViewLedger?: (recruitId: string) => void;
}) {
  const name = member.displayName ?? member.email;

  return (
    <div className="rounded-md border border-border bg-background p-3 space-y-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">
            {member.email} · SliceWP #{member.slicewpId}
          </p>
        </div>
        <Badge variant={member.status === "ACTIVE" ? "paid" : "outline"}>
          {member.status}
        </Badge>
      </div>

      {member.rules.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {member.rules.map((rule) => (
            <Badge key={rule.id} variant="secondary" className="text-xs">
              {rule.name} · {rule.ratePercent}%
              {rule.milestoneRevenueThreshold
                ? ` · ${formatCurrency(Number(rule.milestoneRevenueThreshold))} milestone`
                : ""}
            </Badge>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3 text-sm">
        <span>
          Revenue:{" "}
          <strong>{formatCurrency(member.stats.totalRevenue)}</strong>
        </span>
        <span>
          Unpaid:{" "}
          <strong className="text-primary">
            {formatCurrency(member.stats.unpaidTeamBonus)}
          </strong>
        </span>
        <span>
          Pending:{" "}
          <strong className="text-warning">
            {formatCurrency(member.stats.pendingTeamBonus)}
          </strong>
        </span>
        <span>
          Paid:{" "}
          <strong className="text-success">
            {formatCurrency(member.stats.paidTeamBonus)}
          </strong>
        </span>
      </div>

      {member.stats.milestone && !member.stats.milestone.met && (
        <p className="text-xs text-muted-foreground">
          Milestone: {formatCurrency(member.stats.milestone.current)} /{" "}
          {formatCurrency(member.stats.milestone.threshold ?? 0)} ·{" "}
          {formatCurrency(member.stats.milestone.remaining)} to go
        </p>
      )}

      {onViewLedger && member.stats.unpaidTeamBonus + member.stats.paidTeamBonus > 0 && (
        <button
          type="button"
          onClick={() => onViewLedger(member.id)}
          className="text-xs text-primary hover:underline"
        >
          View ledger for this recruit →
        </button>
      )}
    </div>
  );
}

function TeamCard({
  team,
  expanded,
  onToggle,
  onViewLedger,
  onViewTeamLedger,
  adminView = false,
}: {
  team: TeamSummary;
  expanded: boolean;
  onToggle: () => void;
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView?: boolean;
}) {
  const { data, isLoading } = useTeamDetail(team.id, expanded);

  return (
    <Card className={!team.active ? "opacity-70" : undefined}>
      <CardHeader className="cursor-pointer pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1">
            <CardTitle className="text-lg flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              {team.name}
              {!team.active && (
                <Badge variant="secondary" className="ml-1">
                  Inactive
                </Badge>
              )}
            </CardTitle>
            {team.description && (
              <CardDescription>{team.description}</CardDescription>
            )}
            <p className="text-xs text-muted-foreground">
              {team.memberCount} recruit{team.memberCount === 1 ? "" : "s"} ·{" "}
              {team.ruleCount} rule{team.ruleCount === 1 ? "" : "s"}
            </p>
          </div>
          <div className="text-right text-sm shrink-0">
            <p className="font-semibold text-primary">
              {formatCurrency(team.stats.unpaidTeamBonus)}
            </p>
            <p className="text-xs text-muted-foreground">unpaid bonus</p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div className="grid gap-3 sm:grid-cols-4 text-sm border-t pt-3">
          <div>
            <p className="text-muted-foreground text-xs">Team revenue</p>
            <p className="font-medium">
              {formatCurrency(team.stats.totalRevenue)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Unpaid</p>
            <p className="font-medium text-primary">
              {formatCurrency(team.stats.unpaidTeamBonus)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Pending</p>
            <p className="font-medium text-warning">
              {formatCurrency(team.stats.pendingTeamBonus)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">Paid</p>
            <p className="font-medium text-success">
              {formatCurrency(team.stats.paidTeamBonus)}
            </p>
          </div>
        </div>

        {onViewTeamLedger && team.stats.unpaidTeamBonus > 0 && (
          <div className="mt-3 flex justify-end">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onViewTeamLedger(team.id);
              }}
              className="text-xs font-medium text-primary hover:underline"
            >
              View all unpaid bonuses for this team →
            </button>
          </div>
        )}

        {expanded && (
          <div className="mt-4 space-y-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground">Loading recruits...</p>
            )}
            {data?.team.members.length === 0 && (
              <p className="text-sm text-muted-foreground">
                No recruits assigned yet. {adminView ? "Add deal rules to this team." : "Your admin will add recruits via deal rules."}
              </p>
            )}
            {data?.team.members.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                onViewLedger={onViewLedger}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function TeamsPanel({
  teams,
  onViewLedger,
  onViewTeamLedger,
  adminView = false,
}: {
  teams: TeamSummary[];
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView?: boolean;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    teams.length === 1 ? teams[0]?.id ?? null : null
  );

  if (teams.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>My teams</CardTitle>
          <CardDescription>
            Teams group your recruits and their deal rules. Ask your admin to
            set up teams and assign rules.
          </CardDescription>
        </CardHeader>
      </Card>
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
        />
      ))}
    </div>
  );
}
