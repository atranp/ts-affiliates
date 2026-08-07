"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { MilestoneProgress } from "@/components/affiliate/MilestoneProgress";
import { apiFetch } from "@/lib/api-client";
import {
  AFFILIATE_COPY,
  memberCountLabel,
  teamDealLabel,
} from "@/lib/affiliate/copy";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import {
  buildShareSlices,
  concentrationLeader,
  countSegments,
  groupMembers,
  memberName,
  memberSpecificRules,
  segmentSummaryLabel,
  SORT_KEYS,
  teamWideRules,
  type MemberSegment,
  type ShareSlice,
  type SortKey,
} from "@/lib/teams/roster";
import { formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type TeamMemberDetail = TeamDetail["members"][number];
type TeamRule = TeamDetail["rules"][number];

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

function ShareBar({ slices }: { slices: ShareSlice[] }) {
  return (
    <div className="flex h-2 overflow-hidden rounded-full bg-border">
      {slices.map((slice) => (
        <div
          key={slice.id}
          className={slice.tone}
          style={{ width: `${slice.percent}%` }}
          title={`${slice.label} · ${Math.round(slice.percent)}%`}
        />
      ))}
    </div>
  );
}

function formatRuleSummary(rule: TeamRule, affiliateView: boolean) {
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
  segment,
  sharePercent,
  onViewLedger,
  affiliateView,
}: {
  member: TeamMemberDetail;
  segment: MemberSegment;
  sharePercent: number | null;
  onViewLedger?: (recruitId: string) => void;
  affiliateView: boolean;
}) {
  const name = memberName(member);
  const ownRules = memberSpecificRules(member);
  const hasCommissions =
    member.stats.unpaidTeamBonus + member.stats.paidTeamBonus > 0;

  return (
    <div className="rounded-lg border border-border bg-card p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium truncate">{name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {affiliateView
              ? member.email
              : `${member.email} · SliceWP #${member.slicewpId}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {sharePercent != null && sharePercent >= 1 && (
            <Badge variant="outline">
              {Math.round(sharePercent)}% of team sales
            </Badge>
          )}
          {!affiliateView && (
            <Badge variant={member.status === "ACTIVE" ? "paid" : "outline"}>
              {member.status}
            </Badge>
          )}
        </div>
      </div>

      {ownRules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {ownRules
            .map((rule) => formatRuleSummary(rule, affiliateView))
            .join(" · ")}
        </p>
      )}

      {segment !== "inactive" && member.stats.milestone && (
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
          {affiliateView ? AFFILIATE_COPY.team.viewCommissions : "View ledger"}
        </button>
      )}
    </div>
  );
}

function InactiveMemberTable({
  members,
  affiliateView,
}: {
  members: TeamMemberDetail[];
  affiliateView: boolean;
}) {
  return (
    <div className="rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Email</TableHead>
            {!affiliateView && <TableHead>Status</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {members.map((member) => (
            <TableRow key={member.id}>
              <TableCell className="font-medium">
                {memberName(member)}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {member.email}
              </TableCell>
              {!affiliateView && (
                <TableCell>
                  <Badge
                    variant={member.status === "ACTIVE" ? "paid" : "outline"}
                  >
                    {member.status}
                  </Badge>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function TeamRoster({
  members,
  rules,
  affiliateView,
  onViewLedger,
}: {
  members: TeamMemberDetail[];
  rules: TeamRule[];
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [showInactive, setShowInactive] = useState(false);

  const teamRevenue = useMemo(
    () => members.reduce((sum, member) => sum + member.stats.totalRevenue, 0),
    [members]
  );

  const shareSlices = useMemo(() => buildShareSlices(members), [members]);
  const counts = useMemo(() => countSegments(members), [members]);
  const grouped = useMemo(
    () => groupMembers(members, { search, sortKey }),
    [members, search, sortKey]
  );

  const matchCount =
    grouped.earning.length + grouped.ramping.length + grouped.inactive.length;

  const leader = concentrationLeader(shareSlices, members.length);
  const sharedRules = teamWideRules(rules);

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {segmentSummaryLabel(counts)}
      </p>

      {shareSlices.length > 0 && (
        <div className="space-y-1.5">
          <ShareBar slices={shareSlices} />
          {leader && (
            <p className="text-xs text-muted-foreground">
              {AFFILIATE_COPY.team.concentration(
                leader.label,
                Math.round(leader.percent)
              )}
            </p>
          )}
        </div>
      )}

      {sharedRules.length > 0 && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <p className="text-xs font-semibold text-muted-foreground">
            {AFFILIATE_COPY.team.teamDeal}
          </p>
          <ul className="mt-1 space-y-0.5">
            {sharedRules.map((rule) => (
              <li key={rule.id} className="text-xs text-foreground">
                {affiliateView
                  ? teamDealLabel(
                      rule.ratePercent,
                      rule.milestoneRevenueThreshold,
                      formatCurrency
                    )
                  : formatRuleSummary(rule, affiliateView)}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={AFFILIATE_COPY.team.searchPlaceholder}
            className="pl-8"
            aria-label={AFFILIATE_COPY.team.searchPlaceholder}
          />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          {AFFILIATE_COPY.team.sortLabel}
          <select
            value={sortKey}
            onChange={(event) => setSortKey(event.target.value as SortKey)}
            className="h-9 rounded-md border border-input bg-card px-2 text-sm text-foreground shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            {SORT_KEYS.map((key) => (
              <option key={key} value={key}>
                {AFFILIATE_COPY.team.sort[key]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {matchCount === 0 && (
        <p className="text-sm text-muted-foreground">
          {AFFILIATE_COPY.team.noMatches}
        </p>
      )}

      {(["earning", "ramping"] as const).map((segment) =>
        grouped[segment].length === 0 ? null : (
          <section key={segment} className="space-y-2">
            <div>
              <h3 className="text-sm font-semibold">
                {AFFILIATE_COPY.team.segments[segment].title}
                <span className="ml-2 font-normal text-muted-foreground">
                  {grouped[segment].length}
                </span>
              </h3>
              <p className="text-xs text-muted-foreground">
                {AFFILIATE_COPY.team.segments[segment].description}
              </p>
            </div>
            <div className="space-y-3">
              {grouped[segment].map((member) => (
                <TeamMemberRow
                  key={member.id}
                  member={member}
                  segment={segment}
                  sharePercent={
                    teamRevenue > 0
                      ? (member.stats.totalRevenue / teamRevenue) * 100
                      : null
                  }
                  onViewLedger={onViewLedger}
                  affiliateView={affiliateView}
                />
              ))}
            </div>
          </section>
        )
      )}

      {grouped.inactive.length > 0 && (
        <section className="space-y-2">
          <button
            type="button"
            onClick={() => setShowInactive((current) => !current)}
            className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={showInactive}
          >
            {showInactive ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            {showInactive
              ? AFFILIATE_COPY.team.hideInactive
              : AFFILIATE_COPY.team.showInactive(grouped.inactive.length)}
          </button>
          {showInactive && (
            <InactiveMemberTable
              members={grouped.inactive}
              affiliateView={affiliateView}
            />
          )}
        </section>
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
      <CardHeader
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        className="cursor-pointer pb-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                  {affiliateView ? AFFILIATE_COPY.team.inactive : "Inactive"}
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
        <div className="grid gap-3 text-sm border-t pt-3 sm:grid-cols-3">
          <div>
            <p className="text-muted-foreground text-xs">
              {affiliateView ? AFFILIATE_COPY.team.teamRevenue : "Team revenue"}
            </p>
            <p className="font-medium">
              {formatCurrency(team.stats.totalRevenue)}
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
          <div>
            <p className="text-muted-foreground text-xs">
              {AFFILIATE_COPY.team.paid}
            </p>
            <p className="font-medium text-success">
              {formatCurrency(team.stats.paidTeamBonus)}
            </p>
          </div>
        </div>

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
              {affiliateView ? AFFILIATE_COPY.team.viewUnpaid : "View unpaid"}
            </button>
          </div>
        )}

        {expanded && (
          <div className="mt-4">
            {isLoading && (
              <p className="text-sm text-muted-foreground">
                {affiliateView
                  ? AFFILIATE_COPY.team.loading
                  : "Loading recruits..."}
              </p>
            )}
            {data?.team.members.length === 0 && (
              <p className="text-sm text-muted-foreground">
                {affiliateView ? AFFILIATE_COPY.team.empty : "No recruits yet."}
              </p>
            )}
            {data && data.team.members.length > 0 && (
              <TeamRoster
                members={data.team.members}
                rules={data.team.rules}
                affiliateView={affiliateView}
                onViewLedger={onViewLedger}
              />
            )}
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
