/**
 * Pure filtering/ranking helpers for the team roster table.
 *
 * Rosters are heavily skewed — a handful of members usually account for nearly
 * all team sales — so the UI ranks by contribution and lets the long tail be
 * filtered out rather than listing everyone at equal weight.
 */

import type { TeamMemberSummary, TeamRuleSummary } from "./queries";

export const SEGMENT_ORDER = ["earning", "ramping", "inactive"] as const;
export type MemberSegment = (typeof SEGMENT_ORDER)[number];
export type SegmentFilter = "all" | MemberSegment;

export const SORT_KEYS = [
  "name",
  "revenue",
  "goal",
  "owed",
  "pending",
] as const;
export type SortKey = (typeof SORT_KEYS)[number];
export type SortDirection = "asc" | "desc";

/** Names read naturally A–Z; every money column is most interesting at the top. */
const DEFAULT_DIRECTIONS: Record<SortKey, SortDirection> = {
  name: "asc",
  revenue: "desc",
  goal: "desc",
  owed: "desc",
  pending: "desc",
};

export function defaultDirectionFor(key: SortKey): SortDirection {
  return DEFAULT_DIRECTIONS[key];
}

export function memberName(member: TeamMemberSummary) {
  return member.displayName ?? member.email;
}

/**
 * Bonus the sponsor can actually collect. PENDING is deliberately excluded —
 * those overrides stay locked until the member clears their sales milestone, so a
 * pending balance means "still ramping", not "earning".
 */
export function unlockedBonus(member: TeamMemberSummary) {
  return member.stats.unpaidTeamBonus + member.stats.paidTeamBonus;
}

export function segmentOf(member: TeamMemberSummary): MemberSegment {
  if (unlockedBonus(member) > 0 || member.stats.milestone?.met) return "earning";
  if (member.stats.totalRevenue > 0) return "ramping";
  return "inactive";
}

/** 0–1. Members without a milestone count as complete once they have any sales. */
export function goalRatio(member: TeamMemberSummary) {
  const milestone = member.stats.milestone;
  if (!milestone?.threshold) return member.stats.totalRevenue > 0 ? 1 : 0;
  if (milestone.met) return 1;
  return milestone.current / milestone.threshold;
}

export function countSegments(
  members: TeamMemberSummary[]
): Record<MemberSegment, number> {
  const counts: Record<MemberSegment, number> = {
    earning: 0,
    ramping: 0,
    inactive: 0,
  };
  for (const member of members) counts[segmentOf(member)] += 1;
  return counts;
}

export function filterMembers(
  members: TeamMemberSummary[],
  { search, segment }: { search: string; segment: SegmentFilter }
) {
  const term = search.trim().toLowerCase();

  return members.filter((member) => {
    if (segment !== "all" && segmentOf(member) !== segment) return false;
    if (!term) return true;
    return (
      memberName(member).toLowerCase().includes(term) ||
      member.email.toLowerCase().includes(term)
    );
  });
}

const COMPARATORS: Record<
  SortKey,
  (a: TeamMemberSummary, b: TeamMemberSummary) => number
> = {
  name: (a, b) => memberName(a).localeCompare(memberName(b)),
  revenue: (a, b) => a.stats.totalRevenue - b.stats.totalRevenue,
  goal: (a, b) => goalRatio(a) - goalRatio(b),
  owed: (a, b) => a.stats.unpaidTeamBonus - b.stats.unpaidTeamBonus,
  pending: (a, b) => a.stats.pendingTeamBonus - b.stats.pendingTeamBonus,
};

export function sortMembers(
  members: TeamMemberSummary[],
  key: SortKey,
  direction: SortDirection
) {
  const compare = COMPARATORS[key];

  return [...members].sort((a, b) => {
    const result = compare(a, b);
    if (result !== 0) return direction === "asc" ? result : -result;
    // Ties keep a stable, predictable order instead of shuffling on re-sort.
    return memberName(a).localeCompare(memberName(b));
  });
}

/**
 * Team-wide rules are fanned out onto every member server-side, so rendering
 * them per row repeats the same sentence N times. Only member-specific rules
 * differ between rows.
 */
export function memberSpecificRules(member: TeamMemberSummary) {
  return member.rules.filter((rule) => rule.recruit?.id === member.id);
}

export function teamWideRules(rules: TeamRuleSummary[]) {
  return rules.filter((rule) => !rule.recruit);
}
