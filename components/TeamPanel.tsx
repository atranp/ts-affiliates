"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { MilestoneProgress } from "@/components/affiliate/MilestoneProgress";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { TeamMember } from "@/lib/admin/team";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

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
  const affiliateView = !adminView;

  if (team.length === 0) {
    return (
      <div className="ts-panel">
        <div className="ts-panel-header">
          <h2 className="ts-section-title">{AFFILIATE_COPY.team.title}</h2>
        </div>
        <div className="ts-panel-body text-sm text-muted-foreground">
          {AFFILIATE_COPY.team.empty}
        </div>
      </div>
    );
  }

  return (
    <div className="ts-panel">
      <div className="ts-panel-header">
        <h2 className="ts-section-title">
          {AFFILIATE_COPY.team.title} ({team.length})
        </h2>
      </div>
      <div className="ts-panel-body grid gap-3 sm:grid-cols-2">
        {team.map((member) => {
          const name = member.displayName ?? member.email;
          const milestone = member.stats.milestone;

          return (
            <div
              key={member.id}
              className="ts-list-row space-y-3 p-4"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  {adminView ? (
                    <Link
                      href={`/admin/affiliates/${member.id}`}
                      className="font-medium text-primary hover:underline truncate block"
                    >
                      {name}
                    </Link>
                  ) : (
                    <p className="font-medium truncate">{name}</p>
                  )}
                  <p className="text-xs text-muted-foreground truncate">
                    {affiliateView
                      ? member.email
                      : `${member.email} · SliceWP #${member.slicewpId}`}
                  </p>
                </div>
                {!affiliateView && (
                  <Badge
                    variant={member.status === "ACTIVE" ? "paid" : "outline"}
                  >
                    {member.status}
                  </Badge>
                )}
              </div>

              {member.dealRule && (
                <p className="text-xs text-muted-foreground">
                  {affiliateView
                    ? `${member.dealRule.ratePercent}% team earnings${
                        member.dealRule.milestoneRevenueThreshold
                          ? ` · ${formatCurrency(Number(member.dealRule.milestoneRevenueThreshold))} sales goal`
                          : ""
                      }`
                    : `Rule: ${member.dealRule.name} · ${member.dealRule.ratePercent}%${
                        member.dealRule.milestoneRevenueThreshold
                          ? ` · Milestone ${formatCurrency(Number(member.dealRule.milestoneRevenueThreshold))}`
                          : ""
                      }`}
                </p>
              )}

              {milestone && (
                <MilestoneProgress
                  current={milestone.current}
                  threshold={milestone.threshold}
                  remaining={milestone.remaining}
                  met={milestone.met}
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
                  {AFFILIATE_COPY.team.payout}{" "}
                  <strong className="text-primary">
                    {formatCurrency(member.stats.unpaidTeamBonus)}
                  </strong>
                </span>
                {member.stats.pendingTeamBonus > 0 && (
                  <span className="text-muted-foreground">
                    {AFFILIATE_COPY.team.awaitingMilestone}{" "}
                    <strong className="text-warning">
                      {formatCurrency(member.stats.pendingTeamBonus)}
                    </strong>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
