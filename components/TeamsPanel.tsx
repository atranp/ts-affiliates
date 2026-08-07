"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import {
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Check,
  Clock,
  DollarSign,
  ExternalLink,
  Search,
  Target,
  TrendingUp,
  Users,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
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
  segmentOf,
  sortMembers,
  teamWideRules,
  unlockedBonus,
  type MemberSegment,
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
      `${formatCurrency(Number(rule.milestoneRevenueThreshold))} sales milestone`
    );
  }
  return parts.join(" · ");
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
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <AffiliateStatCard
        label={affiliateView ? AFFILIATE_COPY.team.owedToYou : "Unpaid"}
        hint={AFFILIATE_COPY.team.statsHints.owed}
        value={unpaidTeamBonus}
        tone="primary"
        icon={DollarSign}
        actionLabel={
          onViewTeamLedger && unpaidTeamBonus > 0
            ? affiliateView
              ? AFFILIATE_COPY.team.viewUnpaid
              : "View unpaid"
            : undefined
        }
        onAction={
          onViewTeamLedger && unpaidTeamBonus > 0
            ? () => onViewTeamLedger(team.id)
            : undefined
        }
      />
      <AffiliateStatCard
        label={
          affiliateView ? AFFILIATE_COPY.team.teamRevenue : "Team revenue"
        }
        hint={AFFILIATE_COPY.team.statsHints.teamRevenue}
        value={totalRevenue}
        tone="primary"
        icon={TrendingUp}
      />
      {pendingTeamBonus > 0 && (
        <AffiliateStatCard
          label={AFFILIATE_COPY.team.pending}
          hint={AFFILIATE_COPY.team.statsHints.pending}
          value={pendingTeamBonus}
          tone="warning"
          icon={Clock}
        />
      )}
      {paidTeamBonus > 0 && (
        <AffiliateStatCard
          label={AFFILIATE_COPY.team.paid}
          hint={AFFILIATE_COPY.team.statsHints.paid}
          value={paidTeamBonus}
          tone="success"
          icon={Users}
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
      className={cn(
        "sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm first:pl-5 last:pr-5",
        align === "right" && "text-right"
      )}
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
          "inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-colors hover:text-brand-dark",
          align === "right" && "flex-row-reverse",
          active ? "text-brand-dark" : "text-muted-foreground"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary" />
          ))}
      </button>
    </TableHead>
  );
}

function MemberAvatar({
  name,
  segment,
}: {
  name: string;
  segment: MemberSegment;
}) {
  const initial = name.trim().charAt(0).toUpperCase() || "?";

  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-semibold ring-1",
        segment === "earning" &&
          "bg-success-soft text-emerald-800 ring-emerald-200/80",
        segment === "ramping" &&
          "bg-warning-soft text-amber-800 ring-amber-200/80",
        segment === "inactive" &&
          "bg-muted text-muted-foreground ring-border/80"
      )}
      aria-hidden
    >
      {initial}
    </span>
  );
}

function GoalCell({ member }: { member: TeamMemberDetail }) {
  const milestone = member.stats.milestone;

  if (!milestone?.threshold) {
    return <span className="text-muted-foreground/70">—</span>;
  }

  if (milestone.met) {
    return (
      <span
        className="inline-flex items-center text-emerald-700"
        title={AFFILIATE_COPY.team.goalReached}
      >
        <Check className="h-4 w-4 stroke-[2.5]" aria-hidden />
        <span className="sr-only">{AFFILIATE_COPY.team.goalReached}</span>
      </span>
    );
  }

  const percent = Math.min(
    100,
    Math.round((milestone.current / milestone.threshold) * 100)
  );

  const barTone =
    percent >= 50
      ? "bg-primary"
      : percent > 0
        ? "bg-amber-500"
        : "bg-transparent";

  return (
    <div
      className="flex min-w-[7.5rem] items-center gap-2.5"
      title={`${formatCurrency(milestone.current)} / ${formatCurrency(
        milestone.threshold
      )}`}
    >
      <div className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-border/80">
        <div
          className={cn("h-full rounded-full transition-all", barTone)}
          style={{ width: `${Math.max(percent, percent > 0 ? 8 : 0)}%` }}
        />
      </div>
      <span
        className={cn(
          "text-xs font-medium tabular-nums",
          percent >= 50 ? "text-primary" : "text-muted-foreground"
        )}
      >
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
  const segment = segmentOf(member);
  const ownRules = memberSpecificRules(member);
  const canViewLedger = !!onViewLedger && unlockedBonus(member) > 0;

  return (
    <TableRow
      className={cn(
        "border-border/60 transition-colors",
        segment === "earning" && "bg-success-soft/25 hover:bg-success-soft/40",
        segment === "ramping" && "bg-warning-soft/20 hover:bg-warning-soft/35",
        segment === "inactive" && "hover:bg-muted/50"
      )}
    >
      <TableCell className="px-4 py-3.5 first:pl-5">
        <div className="flex items-start gap-3">
          <MemberAvatar name={name} segment={segment} />
          <div className="min-w-0">
            {canViewLedger ? (
              <button
                type="button"
                onClick={() => onViewLedger?.(member.id)}
                className="truncate text-left font-semibold text-brand-dark transition-colors hover:text-primary hover:underline"
              >
                {name}
              </button>
            ) : (
              <span className="truncate font-semibold text-brand-dark">
                {name}
              </span>
            )}
            <span className="mt-0.5 block truncate text-xs text-muted-foreground">
              {affiliateView
                ? member.email
                : `${member.email} · SliceWP #${member.slicewpId}`}
            </span>
            {ownRules.length > 0 && (
              <span className="mt-1 block text-xs text-muted-foreground">
                {ownRules
                  .map((rule) => formatRuleSummary(rule, affiliateView))
                  .join(" · ")}
              </span>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell className="px-4 py-3.5 text-right tabular-nums">
        {member.stats.totalRevenue > 0 ? (
          <span className="font-medium text-brand-dark">
            {formatCurrency(member.stats.totalRevenue)}
          </span>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </TableCell>
      <TableCell className="px-4 py-3.5">
        <GoalCell member={member} />
      </TableCell>
      <TableCell className="px-4 py-3.5 text-right tabular-nums">
        {member.stats.unpaidTeamBonus > 0 ? (
          <span className="font-semibold text-primary">
            {formatCurrency(member.stats.unpaidTeamBonus)}
          </span>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </TableCell>
      <TableCell className="px-4 py-3.5 text-right tabular-nums last:pr-5">
        {member.stats.pendingTeamBonus > 0 ? (
          <span className="font-medium text-amber-700">
            {formatCurrency(member.stats.pendingTeamBonus)}
          </span>
        ) : (
          <span className="text-muted-foreground/70">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function TeamContext({
  sharedRules,
  affiliateView,
}: {
  sharedRules: TeamRule[];
  affiliateView: boolean;
}) {
  if (sharedRules.length === 0) return null;

  return (
    <div className="ts-figure flex gap-3">
      <div className="ts-icon-box shrink-0 bg-primary/10 text-primary">
        <Target className="h-4 w-4" />
      </div>
      <div className="min-w-0 space-y-1">
        <p className="ts-figure-label">{AFFILIATE_COPY.team.teamDeal}</p>
        <p className="text-sm leading-relaxed text-brand-dark">
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
      </div>
    </div>
  );
}

function TeamRoster({
  members,
  rules,
  affiliateView,
  onViewLedger,
  fillHeight = false,
}: {
  members: TeamMemberDetail[];
  rules: TeamRule[];
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
  fillHeight?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [direction, setDirection] = useState<SortDirection>("desc");

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

  const filters: Array<{ key: SegmentFilter; label: string; count: number }> =
    useMemo(() => {
      const counts = countSegments(members);
      return [
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
    }, [members]);

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setDirection((current) => (current === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setDirection(defaultDirectionFor(key));
  }

  return (
    <div
      className={cn(
        fillHeight ? "flex min-h-0 flex-1 flex-col gap-4" : "space-y-4"
      )}
    >
      <div className={cn(fillHeight && "shrink-0")}>
        <TeamContext
          sharedRules={sharedRules}
          affiliateView={affiliateView}
        />
      </div>

      <div
        className={cn("ts-table-wrap", fillHeight && "ts-table-fill min-h-0")}
      >
        <div className="ts-table-toolbar flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="ts-segment flex-wrap">
            {filters.map((filter) => (
              <button
                key={filter.key}
                type="button"
                onClick={() => setSegment(filter.key)}
                aria-pressed={segment === filter.key}
                className={cn(
                  "ts-segment-item",
                  segment === filter.key
                    ? "ts-segment-item-active"
                    : "ts-segment-item-inactive"
                )}
              >
                {filter.label}
                <span className="ml-1.5 tabular-nums opacity-70">
                  {filter.count}
                </span>
              </button>
            ))}
          </div>

          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={AFFILIATE_COPY.team.searchPlaceholder}
              className="ts-input pl-9"
              aria-label={AFFILIATE_COPY.team.searchPlaceholder}
            />
          </div>
        </div>

        {rows.length === 0 ? (
          <div
            className={cn(
              "px-6 py-12 text-center",
              fillHeight && "flex min-h-0 flex-1 flex-col items-center justify-center"
            )}
          >
            <p className="text-sm font-medium text-brand-dark">
              {AFFILIATE_COPY.team.noMatches}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Try another filter or search term.
            </p>
          </div>
        ) : (
          <Table
            containerClassName={cn(fillHeight && "ts-table-body-scroll")}
          >
            <TableHeader>
              <TableRow className="border-border/80 hover:bg-transparent">
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
        )}
      </div>
    </div>
  );
}

function TeamRosterLoader({
  teamId,
  enabled,
  affiliateView,
  onViewLedger,
  fillHeight = false,
}: {
  teamId: string;
  enabled: boolean;
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
  fillHeight?: boolean;
}) {
  const { data, isLoading } = useTeamDetail(teamId, enabled);

  if (!enabled) return null;

  if (isLoading) {
    return (
      <div
        className={cn(
          "animate-pulse rounded-xl border border-border bg-muted/30",
          fillHeight ? "min-h-0 flex-1" : "h-64"
        )}
      />
    );
  }

  if (!data || data.team.members.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-muted/20 px-6 py-12 text-center">
        <p className="text-sm font-medium text-brand-dark">
          {affiliateView ? AFFILIATE_COPY.team.empty : "No recruits yet."}
        </p>
      </div>
    );
  }

  return (
    <TeamRoster
      members={data.team.members}
      rules={data.team.rules}
      affiliateView={affiliateView}
      onViewLedger={onViewLedger}
      fillHeight={fillHeight}
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

function TeamMeta({
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
              ? "Filter by status or search by name and email."
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
        <TeamStats
          team={team}
          affiliateView={affiliateView}
          onViewTeamLedger={onViewTeamLedger}
        />
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

    return (
      <section
        className={cn(
          "ts-panel",
          fillHeight && "flex min-h-0 flex-1 flex-col",
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
            "ts-panel-body space-y-6",
            fillHeight && "flex min-h-0 flex-1 flex-col"
          )}
        >
          <div className={cn("space-y-6", fillHeight && "shrink-0")}>
            <TeamMeta
              team={team}
              affiliateView={affiliateView}
              adminView={adminView}
              sponsorAffiliateId={sponsorAffiliateId}
              showAdminLink={!showName}
            />

            <TeamStats
              team={team}
              affiliateView={affiliateView}
              onViewTeamLedger={onViewTeamLedger}
            />
          </div>

          <div className={cn(fillHeight && "flex min-h-0 flex-1 flex-col")}>
            <TeamRosterLoader
              teamId={team.id}
              enabled
              affiliateView={affiliateView}
              onViewLedger={onViewLedger}
              fillHeight={fillHeight}
            />
          </div>
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
