"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { apiFetch } from "@/lib/api-client";
import type { TeamMember } from "@/lib/admin/team";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export function useTeam(affiliateId?: string, enabled = true) {
  const url = affiliateId
    ? `/api/team?affiliateId=${affiliateId}`
    : "/api/team";

  return useQuery({
    queryKey: ["team", affiliateId ?? "self"],
    queryFn: () => apiFetch<{ team: TeamMember[] }>(url),
    enabled,
    staleTime: 60 * 1000,
  });
}

export function TeamPanel({
  team,
  adminView = false,
}: {
  team: TeamMember[];
  adminView?: boolean;
}) {
  if (team.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team</CardTitle>
          <CardDescription>
            Recruits and downline affiliates you earn team bonuses from
          </CardDescription>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No team members yet. Link recruits via deal rules or sync SliceWP
          Multi-level Affiliates parent data.
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team ({team.length})</CardTitle>
        <CardDescription>
          Affiliates under you — deal-rule recruits and SliceWP parent links
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {team.map((member) => {
          const name = member.displayName ?? member.email;
          const milestone = member.stats.milestone;

          return (
            <div
              key={member.id}
              className="rounded-md border border-border bg-card p-3 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  {adminView ? (
                    <Link
                      href={`/admin/affiliates/${member.id}`}
                      className="font-medium text-primary hover:underline"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="font-medium">{name}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {member.email} · SliceWP #{member.slicewpId}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1">
                  {member.sources.map((source) => (
                    <Badge key={source} variant="secondary">
                      {source === "deal_rule" ? "Deal rule" : "SliceWP parent"}
                    </Badge>
                  ))}
                  <Badge variant={member.status === "ACTIVE" ? "paid" : "outline"}>
                    {member.status}
                  </Badge>
                </div>
              </div>

              {member.dealRule && (
                <p className="text-sm text-muted-foreground">
                  Rule: {member.dealRule.name} · {member.dealRule.ratePercent}%
                  {member.dealRule.milestoneRevenueThreshold
                    ? ` · Milestone ${formatCurrency(Number(member.dealRule.milestoneRevenueThreshold))}`
                    : ""}
                </p>
              )}

              <div className="flex flex-wrap gap-3 text-sm">
                <span>
                  Revenue:{" "}
                  <strong>{formatCurrency(member.stats.totalRevenue)}</strong>
                </span>
                <span>
                  Unpaid bonus:{" "}
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
              </div>

              {milestone && (
                <div className="text-sm">
                  {milestone.met ? (
                    <Badge variant="paid">Milestone reached</Badge>
                  ) : (
                    <p className="text-muted-foreground">
                      Milestone progress:{" "}
                      <strong>
                        {formatCurrency(milestone.current)} /{" "}
                        {formatCurrency(milestone.threshold ?? 0)}
                      </strong>
                      {" · "}
                      {formatCurrency(milestone.remaining)} to go — team
                      bonuses unlock at threshold
                    </p>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
