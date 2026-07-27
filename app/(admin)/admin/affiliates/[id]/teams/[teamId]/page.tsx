"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { Suspense } from "react";
import { ArrowLeft, Share2 } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { TeamDetail } from "@/lib/teams/queries";
import { formatCurrency } from "@/lib/utils";

function AdminTeamDetailContent() {
  const params = useParams<{ id: string; teamId: string }>();
  const affiliateId = params.id;
  const teamId = params.teamId;

  const {
    data,
    isLoading,
    error,
    refetch,
  } = useAdminQuery<{ team: TeamDetail }>(
    ["admin", "team", teamId],
    `/api/teams/${teamId}`
  );

  const team = data?.team;

  if (error) {
    return (
      <ErrorState message={error.message} onRetry={() => void refetch()} />
    );
  }

  if (isLoading || !team) {
    return <p className="text-sm text-muted-foreground p-6">Loading team...</p>;
  }

  const teamWideRules = team.rules.filter((rule) => !rule.recruit);

  return (
    <div className="space-y-6">
      <PageHeader
        title={team.name}
        description={team.description ?? undefined}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href={`/admin/affiliates/${affiliateId}?tab=team`}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Back to affiliate
              </Link>
            </Button>
            <Button asChild>
              <Link
                href={`/admin/deal-rules?sponsorId=${affiliateId}&teamId=${team.id}&create=1`}
              >
                <Share2 className="mr-2 h-4 w-4" />
                Add deal rule
              </Link>
            </Button>
          </div>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Members" value={String(team.memberCount)} />
        <StatCard
          label="Team revenue"
          value={formatCurrency(team.stats.totalRevenue)}
        />
        <StatCard
          label="Unpaid bonus"
          value={formatCurrency(team.stats.unpaidTeamBonus)}
        />
        <StatCard
          label="Paid bonus"
          value={formatCurrency(team.stats.paidTeamBonus)}
        />
      </div>

      {teamWideRules.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Team-wide rules</CardTitle>
            <CardDescription>
              Apply to every recruit in this team
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {teamWideRules.map((rule) => (
              <Badge key={rule.id} variant={rule.active ? "paid" : "secondary"}>
                {rule.name} · {rule.ratePercent}%
                {rule.milestoneRevenueThreshold
                  ? ` · ${formatCurrency(Number(rule.milestoneRevenueThreshold))} milestone`
                  : ""}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Members</CardTitle>
          <CardDescription>
            {team.memberCount} recruit{team.memberCount === 1 ? "" : "s"}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {team.members.length === 0 && (
            <p className="text-sm text-muted-foreground">No members yet.</p>
          )}
          {team.members.map((member) => (
            <div
              key={member.id}
              className="rounded-md border border-border p-3 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <Link
                    href={`/admin/affiliates/${member.id}`}
                    className="font-medium hover:underline"
                  >
                    {member.displayName ?? member.email}
                  </Link>
                  <p className="text-xs text-muted-foreground">
                    {member.email} · SliceWP #{member.slicewpId}
                  </p>
                </div>
                <Badge variant={member.status === "ACTIVE" ? "paid" : "outline"}>
                  {member.status}
                </Badge>
              </div>
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
              </div>
              {member.stats.milestone && !member.stats.milestone.met && (
                <p className="text-xs text-muted-foreground">
                  Milestone: {formatCurrency(member.stats.milestone.current)} /{" "}
                  {formatCurrency(member.stats.milestone.threshold ?? 0)}
                </p>
              )}
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

export default function AdminTeamDetailPage() {
  return (
    <Suspense fallback={<p className="text-muted-foreground p-6">Loading...</p>}>
      <AdminTeamDetailContent />
    </Suspense>
  );
}
