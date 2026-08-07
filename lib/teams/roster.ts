/**
 * Pure ranking/segmentation helpers for the team roster UI.
 *
 * Rosters are heavily skewed — a handful of members usually account for nearly
 * all team sales — so the UI ranks by contribution and collapses the long tail
 * instead of listing everyone alphabetically at equal weight.
 */

import { memberCountLabel } from "@/lib/affiliate/copy";
import type { TeamMemberSummary, TeamRuleSummary } from "./queries";

export const SEGMENT_ORDER = ["earning", "ramping", "inactive"] as const;
export type MemberSegment = (typeof SEGMENT_ORDER)[number];

export const SORT_KEYS = ["revenue", "owed", "goal", "name"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

/** Top contributors get the strongest tone so the biggest slice reads first. */
const SHARE_TONES = [
  "bg-primary",
  "bg-primary/70",
  "bg-primary/50",
  "bg-primary/35",
  "bg-primary/25",
];
const MAX_SHARE_SLICES = 5;
const CONCENTRATION_NOTE_THRESHOLD = 50;
const MIN_MEMBERS_FOR_CONCENTRATION_NOTE = 3;

export function memberName(member: TeamMemberSummary) {
  return member.displayName ?? member.email;
}

/**
 * Bonus the sponsor can actually collect. PENDING is deliberately excluded —
 * those overrides stay locked until the member clears their sales goal, so a
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

/** 0–1. Members without a goal count as complete once they have any sales. */
export function goalRatio(member: TeamMemberSummary) {
  const milestone = member.stats.milestone;
  if (!milestone?.threshold) return member.stats.totalRevenue > 0 ? 1 : 0;
  if (milestone.met) return 1;
  return milestone.current / milestone.threshold;
}

export function sortMembers(members: TeamMemberSummary[], key: SortKey) {
  const sorted = [...members];

  switch (key) {
    case "owed":
      sorted.sort(
        (a, b) =>
          b.stats.unpaidTeamBonus - a.stats.unpaidTeamBonus ||
          b.stats.totalRevenue - a.stats.totalRevenue
      );
      break;
    case "goal":
      sorted.sort(
        (a, b) =>
          goalRatio(b) - goalRatio(a) ||
          b.stats.totalRevenue - a.stats.totalRevenue
      );
      break;
    case "name":
      sorted.sort((a, b) => memberName(a).localeCompare(memberName(b)));
      break;
    default:
      sorted.sort(
        (a, b) =>
          b.stats.totalRevenue - a.stats.totalRevenue ||
          b.stats.unpaidTeamBonus - a.stats.unpaidTeamBonus
      );
  }

  return sorted;
}

export function groupMembers(
  members: TeamMemberSummary[],
  { search, sortKey }: { search: string; sortKey: SortKey }
): Record<MemberSegment, TeamMemberSummary[]> {
  const term = search.trim().toLowerCase();
  const matched = term
    ? members.filter(
        (member) =>
          memberName(member).toLowerCase().includes(term) ||
          member.email.toLowerCase().includes(term)
      )
    : members;

  const grouped: Record<MemberSegment, TeamMemberSummary[]> = {
    earning: [],
    ramping: [],
    inactive: [],
  };
  for (const member of matched) grouped[segmentOf(member)].push(member);

  for (const segment of SEGMENT_ORDER) {
    // The tail has no numbers to rank by, so it always reads alphabetically.
    grouped[segment] = sortMembers(
      grouped[segment],
      segment === "inactive" ? "name" : sortKey
    );
  }

  return grouped;
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

export function segmentSummaryLabel(counts: Record<MemberSegment, number>) {
  const total = counts.earning + counts.ramping + counts.inactive;
  const parts = [memberCountLabel(total)];

  if (counts.earning > 0) parts.push(`${counts.earning} earning`);
  if (counts.ramping > 0) parts.push(`${counts.ramping} working toward goal`);
  if (counts.inactive > 0) parts.push(`${counts.inactive} no sales yet`);

  return parts.join(" · ");
}

export type ShareSlice = {
  id: string;
  label: string;
  percent: number;
  tone: string;
};

export function buildShareSlices(members: TeamMemberSummary[]): ShareSlice[] {
  const producing = members
    .filter((member) => member.stats.totalRevenue > 0)
    .sort((a, b) => b.stats.totalRevenue - a.stats.totalRevenue);

  const total = producing.reduce(
    (sum, member) => sum + member.stats.totalRevenue,
    0
  );
  if (total <= 0) return [];

  const slices: ShareSlice[] = producing
    .slice(0, MAX_SHARE_SLICES)
    .map((member, index) => ({
      id: member.id,
      label: memberName(member),
      percent: (member.stats.totalRevenue / total) * 100,
      tone: SHARE_TONES[index],
    }));

  const rest = producing.slice(MAX_SHARE_SLICES);
  if (rest.length > 0) {
    const restTotal = rest.reduce(
      (sum, member) => sum + member.stats.totalRevenue,
      0
    );
    slices.push({
      id: "other",
      label: `${rest.length} others`,
      percent: (restTotal / total) * 100,
      tone: "bg-muted-foreground/30",
    });
  }

  return slices;
}

/** The single dominant contributor, if one member carries most of the team. */
export function concentrationLeader(
  slices: ShareSlice[],
  memberCount: number
): ShareSlice | null {
  const leader = slices[0];
  if (!leader || leader.id === "other") return null;
  if (memberCount < MIN_MEMBERS_FOR_CONCENTRATION_NOTE) return null;
  if (leader.percent < CONCENTRATION_NOTE_THRESHOLD) return null;
  return leader;
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
