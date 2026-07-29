"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
import { MilestoneProgress } from "@/components/affiliate/MilestoneProgress";
import { apiFetch } from "@/lib/api-client";
import {
  AFFILIATE_COPY,
  memberCountLabel,
} from "@/lib/affiliate/copy";
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

function formatRuleSummary(
  rule: TeamDetail["members"][number]["rules"][number],
  affiliateView: boolean
) {
  if (!affiliateView) {
    return `${rule.name} · ${rule.ratePercent}%${
      rule.milestoneRevenueThreshold
        ? ` · ${formatCurrency(Number(rule.milestoneRevenueThreshold))} milestone`
        : ""
    }`;
  }

  const parts = [`${rule.ratePercent}% team earnings`];
  if (rule.milestoneRevenueThreshold) {
    parts.push(
      `${formatCurrency(Number(rule.milestoneRevenueThreshold))} sales goal`
    );
  }
  return parts.join(" · ");
}

function TeamMemberRow({
  member,
  onViewLedger,
  affiliateView,
}: {
  member: TeamDetail["members"][number];
  onViewLedger?: (recruitId: string) => void;
  affiliateView: boolean;
}) {
  const name = member.displayName ?? member.email;
  const hasCommissions =
    member.stats.unpaidTeamBonus + member.stats.paidTeamBonus > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {affiliateView ? member.email : `${member.email} · SliceWP #${member.slicewpId}`}
          </p>
        </div>
        {!affiliateView && (
          <Badge variant={member.status === "ACTIVE" ? "paid" : "outline"}>
            {member.status}
          </Badge>
        )}
      </div>

      {member.rules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {member.rules.map((rule) => formatRuleSummary(rule, affiliateView)).join(" · ")}
        </p>
      )}

      {member.stats.milestone && (
        <MilestoneProgress
          current={member.stats.milestone.current}
          threshold={member.stats.milestone.threshold}
          remaining={member.stats.milestone.remaining}
          met={member.stats.milestone.met}
          compact={affiliateView}
        />
      )}

      <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <span className="text-muted-foreground">
          {AFFILIATE_COPY.home.salesLabel}{" "}
          <strong className="text-foreground">
            {formatCurrency(member.stats.totalRevenue)}
          </strong>
        </span>
        <span className="text-muted-foreground">
          {AFFILIATE_COPY.team.owed}{" "}
          <strong className="text-primary">
            {formatCurrency(member.stats.unpaidTeamBonus)}
          </strong>
        </span>
        {member.stats.pendingTeamBonus > 0 && (
          <span className="text-muted-foreground">
            {AFFILIATE_COPY.team.pending}{" "}
            <strong className="text-warning">
              {formatCurrency(member.stats.pendingTeamBonus)}
            </strong>
          </span>
        )}
        {member.stats.paidTeamBonus > 0 && (
          <span className="text-muted-foreground">
            {AFFILIATE_COPY.team.paid}{" "}
            <strong className="text-success">
              {formatCurrency(member.stats.paidTeamBonus)}
            </strong>
          </span>
        )}
      </div>

      {onViewLedger && hasCommissions && (
        <button
          type="button"
          onClick={() => onViewLedger(member.id)}
          className="text-xs font-medium text-primary hover:underline"
        >
          {affiliateView
            ? AFFILIATE_COPY.team.viewCommissions
            : "View ledger"}
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
  sponsorAffiliateId,
}: {
  team: TeamSummary;
  expanded: boolean;
  onToggle: () => void;
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView?: boolean;
  sponsorAffiliateId?: string;
}) {
  const affiliateView = !adminView;
  const { data, isLoading } = useTeamDetail(team.id, expanded);

  return (
    <Card className={!team.active ? "opacity-70" : undefined}>
      <CardHeader className="cursor-pointer pb-3" onClick={onToggle}>
        <div className="flex items-start justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <CardTitle className="text-lg flex items-center gap-2">
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              {adminView && sponsorAffiliateId ? (
                <Link
                  href={`/admin/affiliates/${sponsorAffiliateId}/teams/${team.id}`}
                  className="hover:underline truncate"
                  onClick={(e) => e.stopPropagation()}
                >
                  {team.name}
                </Link>
              ) : (
                <span className="truncate">{team.name}</span>
              )}
              {!team.active && (
                <Badge variant="secondary" className="ml-1 shrink-0">
                  {affiliateView
                    ? AFFILIATE_COPY.team.inactive
                    : "Inactive"}
                </Badge>
              )}
            </CardTitle>
            {team.description && (
              <CardDescription>{team.description}</CardDescription>
            )}
            <p className="text-xs text-muted-foreground">
              {affiliateView
                ? memberCountLabel(team.memberCount)
                : `${team.memberCount} recruit${team.memberCount === 1 ? "" : "s"} · ${team.ruleCount} rule${team.ruleCount === 1 ? "" : "s"}`}
            </p>
          </div>
          <div className="text-right text-sm shrink-0">
            <p className="font-semibold text-primary">
              {formatCurrency(team.stats.unpaidTeamBonus)}
            </p>
            <p className="text-xs text-muted-foreground">
              {affiliateView ? AFFILIATE_COPY.team.owed.toLowerCase() : "unpaid"}
            </p>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pt-0">
        <div
          className={`grid gap-3 text-sm border-t pt-3 ${
            affiliateView ? "sm:grid-cols-3" : "sm:grid-cols-4"
          }`}
        >
          <div>
            <p className="text-muted-foreground text-xs">
              {affiliateView
                ? AFFILIATE_COPY.team.teamRevenue
                : "Team revenue"}
            </p>
            <p className="font-medium">
              {formatCurrency(team.stats.totalRevenue)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {AFFILIATE_COPY.team.owed}
            </p>
            <p className="font-medium text-primary">
              {formatCurrency(team.stats.unpaidTeamBonus)}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground text-xs">
              {AFFILIATE_COPY.team.pending}
            </p>
            <p className="font-medium text-warning">
              {formatCurrency(team.stats.pendingTeamBonus)}
            </p>
          </div>
          {!affiliateView && (
            <div>
              <p className="text-muted-foreground text-xs">Paid</p>
              <p className="font-medium text-success">
                {formatCurrency(team.stats.paidTeamBonus)}
              </p>
            </div>
          )}
        </div>

        {affiliateView && team.stats.paidTeamBonus > 0 && (
          <p className="mt-2 text-xs text-muted-foreground">
            {AFFILIATE_COPY.team.paid}:{" "}
            <span className="font-medium text-success">
              {formatCurrency(team.stats.paidTeamBonus)}
            </span>
          </p>
        )}

        {adminView && sponsorAffiliateId && (
          <div className="mt-3 flex justify-end">
            <Link
              href={`/admin/affiliates/${sponsorAffiliateId}/teams/${team.id}`}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Open team
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        )}

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
              {affiliateView
                ? AFFILIATE_COPY.team.viewUnpaid
                : "View unpaid"}
            </button>
          </div>
        )}

        {expanded && (
          <div className="mt-4 space-y-3">
            {isLoading && (
              <p className="text-sm text-muted-foreground">
                {affiliateView
                  ? AFFILIATE_COPY.team.loading
                  : "Loading recruits..."}
              </p>
            )}
            {data?.team.members.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {affiliateView
                  ? AFFILIATE_COPY.team.empty
                  : "No recruits yet."}
              </p>
            )}
            {data?.team.members.map((member) => (
              <TeamMemberRow
                key={member.id}
                member={member}
                onViewLedger={onViewLedger}
                affiliateView={affiliateView}
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
  sponsorAffiliateId,
}: {
  teams: TeamSummary[];
  onViewLedger?: (recruitId: string) => void;
  onViewTeamLedger?: (teamId: string) => void;
  adminView?: boolean;
  sponsorAffiliateId?: string;
}) {
  const [expandedId, setExpandedId] = useState<string | null>(
    teams.length === 1 ? teams[0]?.id ?? null : null
  );

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
