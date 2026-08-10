"use client";

import { AffiliateAmountCell } from "@/components/affiliate/primitives";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { cn, formatCurrency } from "@/lib/utils";

type MilestoneData = {
  current: number;
  threshold: number;
  met: boolean;
};

export function TeamMilestoneProgress({
  current,
  threshold,
  met,
  variant = "default",
}: MilestoneData & { variant?: "default" | "slim" }) {
  const percent = met
    ? 100
    : Math.min(100, Math.round((current / threshold) * 100));

  if (variant === "slim") {
    return (
      <div className="flex min-w-0 items-center gap-2">
        <span className="ts-micro hidden shrink-0 truncate sm:inline">
          {formatCurrency(current)} / {formatCurrency(threshold)}
        </span>
        <div className="ts-progress-track min-w-[2.5rem]">
          <div
            className={cn(
              "ts-progress-fill",
              met && "ts-progress-fill-met",
            )}
            style={{ width: `${percent}%` }}
          />
        </div>
        <span
          className={cn(
            "ts-micro w-8 shrink-0 text-right tabular-nums",
            met ? "text-emerald-600" : "text-muted-foreground",
          )}
        >
          {percent}%
        </span>
      </div>
    );
  }

  const barTone = met
    ? "bg-emerald-500"
    : percent >= 50
      ? "bg-primary"
      : percent > 0
        ? "bg-amber-500"
        : "bg-transparent";

  return (
    <div className="flex w-full min-w-0 flex-col gap-1">
      <p className="ts-micro truncate">
        {formatCurrency(current)} / {formatCurrency(threshold)}
      </p>
      <div className="flex items-center gap-1.5">
        <div className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-border/80">
          <div
            className={cn("h-full rounded-full transition-all", barTone)}
            style={{
              width: met
                ? "100%"
                : `${Math.max(percent, percent > 0 ? 10 : 0)}%`,
            }}
          />
        </div>
        <span
          className={cn(
            "ts-micro w-8 shrink-0 text-right",
            met && "text-emerald-600",
          )}
        >
          {percent}%
        </span>
      </div>
    </div>
  );
}

function MemberBonusDisplay({
  unpaidAmount,
  pendingAmount,
}: {
  unpaidAmount: number;
  pendingAmount: number;
}) {
  if (unpaidAmount > 0) {
    return (
      <AffiliateAmountCell
        amount={formatCurrency(unpaidAmount)}
        sublabel={AFFILIATE_COPY.team.payout}
        tone="primary"
      />
    );
  }

  if (pendingAmount > 0) {
    return (
      <AffiliateAmountCell
        amount={formatCurrency(pendingAmount)}
        sublabel={AFFILIATE_COPY.team.awaitingMilestone}
        tone="warning"
      />
    );
  }

  return <span className="ts-row-meta text-muted-foreground/70">—</span>;
}

export type TeamMemberRowProps = {
  name: string;
  milestone?: MilestoneData | null;
  unpaidAmount: number;
  pendingAmount: number;
  onClick?: () => void;
  disabled?: boolean;
  segment?: "earning" | "ramping" | "inactive";
  layout?: "card" | "flat";
  className?: string;
};

export function TeamMemberRow({
  name,
  milestone,
  unpaidAmount,
  pendingAmount,
  onClick,
  disabled = false,
  segment,
  layout = "card",
  className,
}: TeamMemberRowProps) {
  const flat = layout === "flat";

  const content = (
    <div
      className={cn(
        flat
          ? "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_4.75rem] items-center gap-x-2.5 sm:gap-x-3"
          : "grid w-full min-w-0 grid-cols-[minmax(0,1fr)_5.5rem] items-center gap-x-3 gap-y-1.5 sm:grid-cols-[minmax(0,1fr)_8.5rem_5.5rem] sm:gap-y-0",
        className,
      )}
    >
      <div className={cn("min-w-0", !flat && "col-span-2 sm:col-span-1")}>
        <p className="ts-row-title truncate">{name}</p>
        {flat && milestone?.threshold ? (
          <p className="ts-micro mt-0.5 truncate sm:hidden">
            {formatCurrency(milestone.current)} /{" "}
            {formatCurrency(milestone.threshold)}
          </p>
        ) : null}
      </div>
      <div className="min-w-0 justify-self-stretch">
        {milestone?.threshold ? (
          <TeamMilestoneProgress
            current={milestone.current}
            threshold={milestone.threshold}
            met={milestone.met}
            variant={flat ? "slim" : "default"}
          />
        ) : (
          <span className="ts-row-meta text-muted-foreground/70">—</span>
        )}
      </div>
      <div className="justify-self-end text-right">
        <MemberBonusDisplay
          unpaidAmount={unpaidAmount}
          pendingAmount={pendingAmount}
        />
      </div>
    </div>
  );

  const rowClass = cn(
    flat ? "ts-divider-row" : "ts-list-row min-w-0 max-w-full",
    !flat && segment === "earning" && "bg-success-soft/15",
    !flat && segment === "ramping" && "bg-warning-soft/10",
    onClick && !disabled && "cursor-pointer",
    disabled && "cursor-default",
  );

  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={disabled}
        className={rowClass}
      >
        {content}
      </button>
    );
  }

  return <div className={rowClass}>{content}</div>;
}
