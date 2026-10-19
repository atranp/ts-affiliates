"use client";

import { Search } from "lucide-react";
import { useMemo, useState } from "react";
import { LedgerFilterSelect } from "@/components/affiliate/LedgerFilterSelect";
import { Input } from "@/components/ui/input";
import { SortableHead } from "@/components/ui/sortable-head";
import {
  Table,
  TableBody,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  MemberMobileCard,
  MemberRow,
  type TeamMemberDetail,
} from "@/components/teams/TeamMemberRows";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import {
  countSegments,
  defaultDirectionFor,
  filterMembers,
  SEGMENT_ORDER,
  sortMembers,
  type SegmentFilter,
  type SortDirection,
  type SortKey,
} from "@/lib/teams/roster";
import { cn, formatCurrency } from "@/lib/utils";

const MOBILE_SORT_OPTIONS: Array<{
  value: `${SortKey}:${SortDirection}`;
  label: string;
}> = [
  {
    value: "revenue:desc",
    label: AFFILIATE_COPY.team.filters.sortSalesHigh,
  },
  {
    value: "revenue:asc",
    label: AFFILIATE_COPY.team.filters.sortSalesLow,
  },
  {
    value: "goal:desc",
    label: AFFILIATE_COPY.team.filters.sortGoalHigh,
  },
  {
    value: "owed:desc",
    label: AFFILIATE_COPY.team.filters.sortUnpaidHigh,
  },
  {
    value: "name:asc",
    label: AFFILIATE_COPY.team.filters.sortNameAz,
  },
];

export function TeamRoster({
  members,
  affiliateView,
  onViewLedger,
  fillHeight = false,
}: {
  members: TeamMemberDetail[];
  affiliateView: boolean;
  onViewLedger?: (recruitId: string) => void;
  fillHeight?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [segment, setSegment] = useState<SegmentFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("revenue");
  const [direction, setDirection] = useState<SortDirection>("desc");

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

  const headClassName = affiliateView
    ? "ts-table-header sticky top-0 z-10 h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] backdrop-blur-sm first:pl-4 sm:px-4 sm:first:pl-5 last:pr-4 sm:last:pr-5"
    : "sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm first:pl-5 last:pr-5";
  const headButtonClassName = affiliateView
    ? undefined
    : "text-[11px] font-semibold uppercase tracking-wider";

  const mobileSortValue = `${sortKey}:${direction}` as `${SortKey}:${SortDirection}`;
  const summaryUnpaid = useMemo(
    () => rows.reduce((sum, member) => sum + member.stats.unpaidTeamBonus, 0),
    [rows]
  );

  return (
    <div
      className={cn(
        "ts-table-wrap min-w-0 max-w-full overflow-hidden",
        fillHeight && "ts-table-fill"
      )}
    >
        <div className="ts-table-toolbar shrink-0 space-y-3">
          <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:items-end sm:justify-between sm:gap-3">
            <div className="flex min-w-0 flex-col gap-2.5 sm:flex-row sm:flex-wrap sm:items-end sm:gap-2.5">
              <LedgerFilterSelect
                ariaLabel="Filter team members"
                value={segment}
                onChange={setSegment}
                className="min-w-0 sm:hidden"
                options={filters.map((filter) => ({
                  value: filter.key,
                  label: filter.label,
                  count: filter.count,
                }))}
              />
              <LedgerFilterSelect
                ariaLabel="Sort team members"
                value={mobileSortValue}
                onChange={(value) => {
                  const [key, dir] = value.split(":") as [
                    SortKey,
                    SortDirection,
                  ];
                  setSortKey(key);
                  setDirection(dir);
                }}
                className="min-w-0 md:hidden sm:min-w-[10.5rem]"
                options={MOBILE_SORT_OPTIONS}
              />
              <div className="ts-segment hidden flex-wrap sm:flex">
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
            </div>

            <div className="relative min-w-0 w-full sm:max-w-xs">
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
        </div>

        {rows.length > 0 && (
          <div className="ts-table-summary">
            <p className="ts-row-meta flex w-full min-w-0 items-center justify-between gap-3">
              <span className="min-w-0 truncate">
                {rows.length.toLocaleString()}{" "}
                {rows.length === 1 ? "member" : "members"}
              </span>
              <span className="shrink-0 text-right">
                <span className="ts-amount block whitespace-nowrap text-primary">
                  {formatCurrency(summaryUnpaid)}
                </span>
                {affiliateView && (
                  <span className="ts-amount-sub">
                    {AFFILIATE_COPY.team.teamCutUnpaid}
                  </span>
                )}
              </span>
            </p>
          </div>
        )}

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
          <>
            <div
              className={cn(
                "hidden md:block",
                fillHeight && "flex min-h-0 flex-1 flex-col overflow-hidden"
              )}
            >
              <Table
                className={affiliateView ? "table-fixed" : undefined}
                containerClassName={cn(
                  affiliateView && "min-w-0 overflow-x-hidden",
                  fillHeight && "ts-table-body-scroll",
                )}
              >
            <TableHeader>
              <TableRow
                className={cn(
                  affiliateView
                    ? "border-border/60 hover:bg-transparent"
                    : "border-border/80 hover:bg-transparent",
                )}
              >
                <SortableHead
                  sortKey="name"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  className={headClassName}
                  buttonClassName={headButtonClassName}
                >
                  {AFFILIATE_COPY.team.columns.member}
                </SortableHead>
                <SortableHead
                  sortKey="revenue"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                  className={headClassName}
                  buttonClassName={headButtonClassName}
                >
                  {AFFILIATE_COPY.team.columns.sales}
                </SortableHead>
                <SortableHead
                  sortKey="goal"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  className={headClassName}
                  buttonClassName={headButtonClassName}
                >
                  {AFFILIATE_COPY.team.columns.goal}
                </SortableHead>
                <SortableHead
                  sortKey="owed"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                  className={headClassName}
                  buttonClassName={headButtonClassName}
                >
                  {AFFILIATE_COPY.team.columns.payout}
                </SortableHead>
                <SortableHead
                  sortKey="pending"
                  activeKey={sortKey}
                  direction={direction}
                  onSort={handleSort}
                  align="right"
                  className={headClassName}
                  buttonClassName={headButtonClassName}
                >
                  {AFFILIATE_COPY.team.columns.awaitingMilestone}
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

            <ul className="ts-divider-list ts-table-body p-0 md:hidden">
                {rows.map((member) => (
                  <MemberMobileCard
                    key={member.id}
                    member={member}
                    onViewLedger={onViewLedger}
                  />
                ))}
            </ul>
          </>
        )}
    </div>
  );
}
