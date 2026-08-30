import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, ChevronRight, TrendingDown, TrendingUp } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type AffiliateStatCardProps = {
  label: string;
  hint?: string;
  value: number | string;
  tone?: "primary" | "success" | "warning";
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  /** Arrow-only affordance in the header (home stat cards). */
  actionArrow?: boolean;
  /** Tighter layout for home dashboard stat row */
  compact?: boolean;
  /**
   * Percent change against the previous period. Null when there is nothing to
   * compare against — a first week, or a baseline of zero where a percentage
   * would be arithmetic rather than information.
   */
  delta?: number | null;
  /** Set false where a rise is bad news. Defaults to "up is good". */
  deltaGood?: boolean;
};

/**
 * Movement against the previous period. Direction is coloured by whether it is
 * good news, not by its sign, so a falling refund rate reads as green.
 */
function DeltaBadge({
  value,
  good = true,
}: {
  value: number;
  good?: boolean;
}) {
  const rising = value >= 0;
  const positive = rising === good;
  const Icon = rising ? TrendingUp : TrendingDown;
  const rounded = Math.abs(value) >= 10 ? Math.round(Math.abs(value)) : Number(Math.abs(value).toFixed(1));

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-semibold tabular-nums",
        positive ? "text-emerald-700" : "text-orange-700"
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {rounded}%
    </span>
  );
}

const toneConfig = {
  primary: {
    value: "text-primary",
    icon: "bg-primary/10 text-primary",
    action: "text-primary",
    hover: "hover:border-primary",
  },
  success: {
    value: "text-emerald-700",
    icon: "bg-emerald-50 text-emerald-700",
    action: "text-emerald-700",
    hover: "hover:border-emerald-500",
  },
  warning: {
    value: "text-amber-700",
    icon: "bg-amber-50 text-amber-700",
    action: "text-amber-700",
    hover: "hover:border-amber-500",
  },
};

export function AffiliateStatCard({
  label,
  hint,
  value,
  tone = "primary",
  icon: Icon,
  actionLabel,
  actionHref,
  onAction,
  actionArrow = false,
  compact = false,
  delta = null,
  deltaGood = true,
}: AffiliateStatCardProps) {
  const display = typeof value === "number" ? formatCurrency(value) : value;
  const config = toneConfig[tone];
  const interactive = Boolean(
    (actionLabel || actionArrow) && (actionHref || onAction)
  );
  const showFooter = Boolean(hint || (actionLabel && !actionArrow));
  const actionAriaLabel =
    actionArrow && actionLabel ? `${label}: ${actionLabel}` : undefined;

  const body = (
    <>
      {compact ? (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {Icon ? (
              <div className="flex items-center gap-2">
                <div
                  className={cn("ts-icon-box shrink-0 p-1.5", config.icon)}
                >
                  <Icon className="h-3.5 w-3.5" />
                </div>
                <span className="ts-stat-label">{label}</span>
              </div>
            ) : (
              <span className="ts-stat-label">{label}</span>
            )}
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className={cn("ts-home-stat-value", config.value)}>{display}</p>
              {delta !== null ? (
                <DeltaBadge value={delta} good={deltaGood} />
              ) : null}
            </div>
          </div>
          {actionArrow ? (
            <ChevronRight
              className={cn(
                "h-4 w-4 shrink-0 text-muted-foreground/50 sm:h-[1.125rem] sm:w-[1.125rem]",
                interactive && [
                  "transition-colors group-hover:text-primary",
                  "transition-transform group-hover:translate-x-0.5",
                ],
              )}
              aria-hidden
            />
          ) : null}
        </div>
      ) : (
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="ts-stat-label">{label}</span>
            <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
              <p className={cn("stat-value tabular-nums", config.value)}>
                {display}
              </p>
              {delta !== null ? (
                <DeltaBadge value={delta} good={deltaGood} />
              ) : null}
            </div>
          </div>
          {Icon ? (
            <div className={cn("ts-icon-box shrink-0", config.icon)}>
              <Icon className="h-5 w-5" />
            </div>
          ) : null}
        </div>
      )}
      {showFooter ? (
        <div
          className={cn(
            // Not `ts-row-meta`: its `truncate` forces one nowrap line, which
            // cuts the hint mid-word on a narrow phone card. Desktop keeps the
            // single line via `line-clamp-1` on the hint itself.
            "border-t border-border/40 text-xs leading-snug text-muted-foreground",
            compact
              ? "flex flex-col gap-1.5 pt-2 lg:flex-row lg:items-center lg:justify-between lg:gap-2 lg:pt-2.5"
              : "flex flex-col gap-1.5 pt-3 lg:flex-row lg:items-center lg:justify-between lg:gap-3",
            !hint && actionLabel && "lg:justify-end"
          )}
        >
          {hint ? (
            <span className={cn("min-w-0", compact && "lg:line-clamp-1")}>
              {hint}
            </span>
          ) : null}
          {/* The header chevron already says "this goes somewhere"; repeating
              it as a label crowds the hint off the line. */}
          {actionLabel && !actionArrow ? (
            <span
              className={cn(
                "inline-flex items-center gap-0.5 text-xs font-medium",
                config.action,
                interactive && "group-hover:underline"
              )}
            >
              {actionLabel}
              <ArrowUpRight className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
            </span>
          ) : null}
        </div>
      ) : null}
    </>
  );

  // The whole card reads as clickable, so make the whole card the target
  // instead of leaving only the footer label hittable.
  const className = cn(
    "ts-stat-card group w-full min-w-0 text-left",
    compact && "ts-stat-card-compact",
    interactive && [
      "hover:shadow-md",
      config.hover,
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ],
  );

  if (actionHref) {
    return (
      <Link href={actionHref} className={className} aria-label={actionAriaLabel}>
        {body}
      </Link>
    );
  }

  if (onAction) {
    return (
      <button
        type="button"
        onClick={onAction}
        className={className}
        aria-label={actionAriaLabel}
      >
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
