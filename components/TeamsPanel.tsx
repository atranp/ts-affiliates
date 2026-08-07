"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight, ChevronUp, ExternalLink, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { apiFetch } from "@/lib/api-client";
import {
  AFFILIATE_COPY,
  memberCountLabel,
  teamDealLabel,
} from "@/lib/affiliate/copy";
import { isSlicewpDownlineTeam } from "@/lib/teams/constants";
import type { TeamDetail, TeamSummary } from "@/lib/teams/queries";
import {
  countSegments,
  defaultDirectionFor,
  filterMembers,
  memberName,
  memberSpecificRules,
  SEGMENT_ORDER,
  sortMembers,
  teamWideRules,
  topContributor,
  unlockedBonus,
  type SegmentFilter,
  type SortDirection,
  type SortKey,
} from "@/lib/teams/roster";
import { cn, formatCurrency } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
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

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone?: string;
}) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("text-base font-medium tabular-nums", tone)}>
        {formatCurrency(value)}
      </p>
    </div>
  );
}

function TeamStats({
  team,
  affiliateView,
  onViewTeamLedger,
}: {
  team: TeamSummary;
  affiliateView: boolean;
  onViewTeamLedger?: (teamId: string) => void;
}) {
  const { totalRevenue, unpaidTeamBonus, pendingTeamBonus, paidTeamBonus } =
    team.stats;

  return (
    <div className="flex flex-wrap items-start gap-x-10 gap-y-4">
      <div>
        <p className="text-xs text-muted-foreground">
          {affiliateView ? AFFILIATE_COPY.team.owedToYou : "Unpaid"}
        </p>
        <p className="text-2xl font-semibold tabular-nums text-primary">
          {formatCurrency(unpaidTeamBonus)}
        </p>
        {onViewTeamLedger && unpaidTeamBonus > 0 && (
          <button
            type="button"
            onClick={() => onViewTeamLedger(team.id)}
            className="text-xs font-medium text-primary hover:underline"
          >
            {affiliateView ? AFFILIATE_COPY.team.viewUnpaid : "View unpaid"}
          </button>
        )}
      </div>

      <Stat
        label={
          affiliateView ? AFFILIATE_COPY.team.teamRevenue : "Team revenue"
        }
        value={totalRevenue}
      />
      {pendingTeamBonus > 0 && (
        <Stat
          label={AFFILIATE_COPY.team.pending}
          value={pendingTeamBonus}
          tone="text-warning"
        />
      )}
      {paidTeamBonus > 0 && (
        <Stat
          label={AFFILIATE_COPY.team.paid}
          value={paidTeamBonus}
          tone="text-success"
        />
      )}
    </div>
  );
}

function SortableHead({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  children,
}: {
  sortKey: SortKey;
  activeKey: SortKey;
  direction: SortDirection;
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  children: React.ReactNode;
}) {
  const active = activeKey === sortKey;

  return (
    <TableHead
      className={align === "right" ? "text-right" : undefined}
      aria-sort={
        active
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 uppercase tracking-wider transition-colors hover:text-foreground",
          align === "right" && "flex-row-reverse",
          active && "text-foreground"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3" />
          ) : (
            <ChevronDown className="h-3 w-3" />
          ))}
      </button>
    </TableHead>
  );
}

function GoalCell({ member }: { member: TeamMemberDetail }) {
  const milestone = member.stats.milestone;

  if (!milestone?.threshold) {
    return <span className="text-muted-foreground">—</span>;
  }

  if (milestone.met) {
    return <Badge variant="paid">{AFFILIATE_COPY.team.goalReachedShort}</Badge>;
  }

  const percent = Math.min(
    100,
    Math.round((milestone.current / milestone.threshold) * 100)
  );

  return (
    <div
      className="flex items-center gap-2"
      title={`${formatCurrency(milestone.current)} / ${formatCurrency(
        milestone.threshold
      )}`}
    >
      <div className="h-1.5 w-16 shrink-0 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary"
          style={{ width: `${percent}%` }}
        />
      </div>
      <span className="text-xs tabular-nums text-muted-foreground">
        {percent}%
      </span>
    </div>
  );
}

function MemberRow({
  member,
  affiliateView,
  onViewLedger,
}: {
  member: TeamMemberDetail;
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
}) {
  const name = memberName(member);
  const ownRules = memberSpecificRules(member);
  // The ledger link filters to unpaid, so members with only locked bonuses
  // would land on an empty view.
  const canViewLedger = !!onViewLedger && unlockedBonus(member) > 0;

  return (
    <TableRow>
      <TableCell>
        {canViewLedger ? (
          <button
            type="button"
            onClick={() => onViewLedger?.(member.id)}
            className="text-left font-medium hover:text-primary hover:underline"
          >
            {name}
          </button>
        ) : (
          <span className="font-medium">{name}</span>
        )}
        <span className="block text-xs text-muted-foreground">
          {affiliateView
            ? member.email
            : `${member.email} · SliceWP #${member.slicewpId}`}
        </span>
        {ownRules.length > 0 && (
          <span className="block text-xs text-muted-foreground">
            {ownRules
              .map((rule) => formatRuleSummary(rule, affiliateView))
              .join(" · ")}
          </span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {member.stats.totalRevenue > 0 ? (
          formatCurrency(member.stats.totalRevenue)
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell>
        <GoalCell member={member} />
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {member.stats.unpaidTeamBonus > 0 ? (
          <span className="font-medium text-primary">
            {formatCurrency(member.stats.unpaidTeamBonus)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
      <TableCell className="text-right tabular-nums">
        {member.stats.pendingTeamBonus > 0 ? (
          <span className="text-warning">
            {formatCurrency(member.stats.pendingTeamBonus)}
          </span>
        ) : (
          <span className="text-muted-foreground">—</span>
        )}
      </TableCell>
    </TableRow>
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
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [direction, setDirection] = useState<SortDirection>("desc");

  const counts = useMemo(() => countSegments(members), [members]);
  const leader = useMemo(() => topContributor(members), [members]);
  const sharedRules = useMemo(() => teamWideRules(rules), [rules]);

  const rows = useMemo(
    () =>
      sortMembers(
        filterMembers(members, { search, segment }),
        sortKey,
        direction
      ),
    [members, search, segment, sortKey, direction]
  );

  const filters: Array<{ key: SegmentFilter; label: string; count: number }> = [
    {
      key: "all",
      label: AFFILIATE_COPY.team.allMembers,
      count: members.length,
    },
    ...SEGMENT_ORDER.filter((key) => counts[key] > 0).map((key) => ({
      key: key as SegmentFilter,
      label: AFFILIATE_COPY.team.segments[key],
      count: counts[key],
    })),
  ];

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection(defaultDirectionFor(key));
  }

  return (
    <div className="space-y-3">
      {sharedRules.length > 0 && (
        <p className="text-xs text-muted-foreground">
          <span className="font-semibold">{AFFILIATE_COPY.team.teamDeal}:</span>{" "}
          {sharedRules
            .map((rule) =>
              affiliateView
                ? teamDealLabel(
                    rule.ratePercent,
                    rule.milestoneRevenueThreshold,
                    formatCurrency
                  )
                : formatRuleSummary(rule, affiliateView)
            )
            .join(" · ")}
        </p>
      )}

      {leader && (
        <p className="text-xs text-muted-foreground">
          {AFFILIATE_COPY.team.concentration(
            leader.name,
            Math.round(leader.percent)
          )}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
        <div className="flex flex-wrap gap-1">
          {filters.map((filter) => (
            <button
              key={filter.key}
              type="button"
              onClick={() => setSegment(filter.key)}
              aria-pressed={segment === filter.key}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                segment === filter.key
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-muted hover:text-foreground"
              )}
            >
              {filter.label}
              <span className="ml-1.5 tabular-nums opacity-70">
                {filter.count}
              </span>
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={AFFILIATE_COPY.team.searchPlaceholder}
            className="pl-8"
            aria-label={AFFILIATE_COPY.team.searchPlaceholder}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          {AFFILIATE_COPY.team.noMatches}
        </p>
      ) : (
        <div className="rounded-lg border border-border">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableHead
                  sortKey="name"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                >
                  {AFFILIATE_COPY.team.columns.member}
                </SortableHead>
                <SortableHead
                  sortKey="revenue"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                >
                  {AFFILIATE_COPY.team.columns.sales}
                </SortableHead>
                <SortableHead
                  sortKey="goal"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                >
                  {AFFILIATE_COPY.team.columns.goal}
                </SortableHead>
                <SortableHead
                  sortKey="owed"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                >
                  {AFFILIATE_COPY.team.columns.owed}
                </SortableHead>
                <SortableHead
                  sortKey="pending"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                >
                  {AFFILIATE_COPY.team.columns.pending}
                </SortableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((member) => (
                <MemberRow
                  key={member.id}
                  member={member}
                  affiliateView={affiliateView}
                  onViewLedger={onViewLedger}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

function TeamRosterLoader({
  teamId,
  enabled,
  affiliateView,
  onViewLedger,
}: {
  teamId: string;
  enabled: boolean;
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
}) {
  const { data, isLoading } = useTeamDetail(teamId, enabled);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <p className="text-sm text-muted-foreground">
        {affiliateView ? AFFILIATE_COPY.team.loading : "Loading recruits..."}
      </p>
    );
  }

  if (!data || data.team.members.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        {affiliateView ? AFFILIATE_COPY.team.empty : "No recruits yet."}
      </p>
    );
  }

  return (
    <TeamRoster
      members={data.team.members}
      rules={data.team.rules}
      affiliateView={affiliateView}
      onViewLedger={onViewLedger}
    />
  );
}

function OpenTeamLink({
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

function TeamCard({
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
          <div className="min-w-0 space-y-1">
            <CardTitle className="flex items-center gap-2 text-lg">
              {expanded ? (
                <ChevronDown className="h-4 w-4 shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 shrink-0" />
              )}
              <span className="truncate">{team.name}</span>
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

      <CardContent className="space-y-4 pt-0">
        <div className="border-t pt-3">
          <TeamStats
            team={team}
            affiliateView={affiliateView}
            onViewTeamLedger={onViewTeamLedger}
          />
        </div>
        <TeamRosterLoader
          teamId={team.id}
          enabled={expanded}
          affiliateView={affiliateView}
          onViewLedger={onViewLedger}
        />
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

  // A lone team needs no container chrome — the page is already about it.
  if (teams.length === 1) {
    const team = teams[0];
    // "X's Downline" restates the page for the person whose downline it is.
    const showName =
      !affiliateView || !isSlicewpDownlineTeam({ slicewpKey: team.slicewpKey ?? null });

    return (
      <section className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            {showName && (
              <h2 className="flex items-center gap-2 text-lg font-semibold">
                <span className="truncate">{team.name}</span>
                {!team.active && (
                  <Badge variant="secondary" className="shrink-0">
                    {affiliateView ? AFFILIATE_COPY.team.inactive : "Inactive"}
                  </Badge>
                )}
              </h2>
            )}
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

        <TeamStats
          team={team}
          affiliateView={affiliateView}
          onViewTeamLedger={onViewTeamLedger}
        />

        <TeamRosterLoader
          teamId={team.id}
          enabled
          affiliateView={affiliateView}
          onViewLedger={onViewLedger}
        />
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
