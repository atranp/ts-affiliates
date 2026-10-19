"use client";

import {
  TeamMemberGoalStatus,
  TeamMemberRow,
} from "@/components/affiliate/TeamMemberRow";
import { TableCell, TableRow } from "@/components/ui/table";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { TeamDetail } from "@/lib/teams/queries";
import {
  memberName,
  memberSpecificRules,
  segmentOf,
  unlockedBonus,
  type MemberSegment,
} from "@/lib/teams/roster";
import { cn, formatCurrency } from "@/lib/utils";

export type TeamMemberDetail = TeamDetail["members"][number];
type TeamRule = TeamDetail["rules"][number];

function formatRuleSummary(rule: TeamRule, affiliateView: boolean) {
  const rate = `${rule.ratePercent}%${rule.isException ? " (exception)" : ""}`;

  if (!affiliateView) {
    return `${rule.name} · ${rate}${
      rule.milestoneRevenueThreshold
        ? ` · ${formatCurrency(Number(rule.milestoneRevenueThreshold))} milestone`
        : ""
    }`;
  }

  const parts = [`${rule.ratePercent}% of commissionable sales`];
  if (rule.milestoneRevenueThreshold) {
    parts.push(
      `${formatCurrency(Number(rule.milestoneRevenueThreshold))} sales milestone`
    );
  }
  return parts.join(" · ");
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

function GoalCell({
  member,
  affiliateView = false,
}: {
  member: TeamMemberDetail;
  affiliateView?: boolean;
}) {
  const milestone = member.stats.milestone;

  return (
    <TeamMemberGoalStatus
      memberSales={member.stats.totalRevenue}
      milestone={
        milestone?.threshold
          ? {
              current: milestone.current,
              threshold: milestone.threshold,
              met: milestone.met,
            }
          : null
      }
      variant={affiliateView ? "slim" : "default"}
      showSalesWhenMet={false}
    />
  );
}

export function MemberRow({
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
  const tdClass = affiliateView
    ? "px-3 py-2.5 align-top first:pl-4 sm:px-4 sm:first:pl-5"
    : "px-4 py-3.5";

  return (
    <TableRow
      className={cn(
        affiliateView
          ? "border-border/60 hover:bg-muted/25"
          : cn(
              "border-border/60 transition-colors",
              segment === "earning" &&
                "bg-success-soft/25 hover:bg-success-soft/40",
              segment === "ramping" &&
                "bg-warning-soft/20 hover:bg-warning-soft/35",
              segment === "inactive" && "hover:bg-muted/50",
            ),
      )}
    >
      <TableCell className={cn(tdClass, affiliateView && "first:pl-4 sm:first:pl-5")}>
        <div className={cn("min-w-0", !affiliateView && "flex items-start gap-3")}>
          {!affiliateView && <MemberAvatar name={name} segment={segment} />}
          <div className="min-w-0">
            {canViewLedger ? (
              <button
                type="button"
                onClick={() => onViewLedger?.(member.id)}
                className={cn(
                  "truncate text-left transition-colors hover:text-primary hover:underline",
                  affiliateView ? "ts-row-title" : "font-semibold text-brand-dark",
                )}
              >
                {name}
              </button>
            ) : (
              <span
                className={cn(
                  "truncate",
                  affiliateView ? "ts-row-title" : "font-semibold text-brand-dark",
                )}
              >
                {name}
              </span>
            )}
            {!affiliateView && (
              <>
                <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                  {`${member.email} · SliceWP #${member.slicewpId}`}
                </span>
                {ownRules.length > 0 && (
                  <span className="mt-1 block text-xs text-muted-foreground">
                    {ownRules
                      .map((rule) => formatRuleSummary(rule, affiliateView))
                      .join(" · ")}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      </TableCell>
      <TableCell
        className={cn(
          tdClass,
          "text-right tabular-nums",
          !affiliateView && "px-4 py-3.5",
        )}
      >
        {member.stats.totalRevenue > 0 ? (
          <span
            className={cn(
              affiliateView ? "ts-row-meta font-medium" : "font-medium text-brand-dark",
            )}
          >
            {formatCurrency(member.stats.totalRevenue)}
          </span>
        ) : (
          <span className="ts-row-meta text-muted-foreground/70">—</span>
        )}
      </TableCell>
      <TableCell className={tdClass}>
        <GoalCell member={member} affiliateView={affiliateView} />
      </TableCell>
      <TableCell className={cn(tdClass, "text-right tabular-nums")}>
        {member.stats.unpaidTeamBonus > 0 ? (
          <div className="inline-flex flex-col items-end">
            <span
              className={cn(
                affiliateView ? "ts-amount text-primary" : "font-semibold text-primary",
              )}
            >
              {formatCurrency(member.stats.unpaidTeamBonus)}
            </span>
            {affiliateView && (
              <span className="ts-amount-sub">
                {AFFILIATE_COPY.team.teamCutUnpaid}
              </span>
            )}
          </div>
        ) : (
          <span className="ts-row-meta text-muted-foreground/70">—</span>
        )}
      </TableCell>
      <TableCell
        className={cn(
          tdClass,
          "text-right tabular-nums last:pr-4 sm:last:pr-5",
        )}
      >
        {member.stats.pendingTeamBonus > 0 ? (
          <div className="inline-flex flex-col items-end">
            <span
              className={cn(
                affiliateView ? "ts-amount text-amber-700" : "font-medium text-amber-700",
              )}
            >
              {formatCurrency(member.stats.pendingTeamBonus)}
            </span>
            {affiliateView && (
              <span className="ts-amount-sub">
                {AFFILIATE_COPY.team.teamCutLocked}
              </span>
            )}
          </div>
        ) : (
          <span className="ts-row-meta text-muted-foreground/70">—</span>
        )}
      </TableCell>
    </TableRow>
  );
}

export function MemberMobileCard({
  member,
  onViewLedger,
}: {
  member: TeamMemberDetail;
  onViewLedger?: (recruitId: string) => void;
}) {
  const name = memberName(member);
  const segment = segmentOf(member);
  const milestone = member.stats.milestone;
  const canViewLedger = !!onViewLedger && unlockedBonus(member) > 0;

  return (
    <li>
      <TeamMemberRow
        layout="flat"
        name={name}
        memberSales={member.stats.totalRevenue}
        milestone={
          milestone?.threshold
            ? {
                current: milestone.current,
                threshold: milestone.threshold,
                met: milestone.met,
              }
            : null
        }
        unpaidAmount={member.stats.unpaidTeamBonus}
        pendingAmount={member.stats.pendingTeamBonus}
        segment={segment}
        onClick={canViewLedger ? () => onViewLedger(member.id) : undefined}
        disabled={!canViewLedger}
      />
    </li>
  );
}
