import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowUpRight } from "lucide-react";
import { cn, formatCurrency } from "@/lib/utils";

type AffiliateStatCardProps = {
  label: string;
  hint: string;
  value: number | string;
  tone?: "primary" | "success" | "warning";
  icon?: LucideIcon;
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
};

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
}: AffiliateStatCardProps) {
  const display = typeof value === "number" ? formatCurrency(value) : value;
  const config = toneConfig[tone];
  const interactive = Boolean(actionLabel && (actionHref || onAction));

  const body = (
    <>
      <div className="flex items-start justify-between">
        <div>
          <span className="ts-stat-label">{label}</span>
          <p className={cn("stat-value mt-1", config.value)}>{display}</p>
        </div>
        {Icon && (
          <div className={cn("ts-icon-box", config.icon)}>
            <Icon className="h-5 w-5" />
          </div>
        )}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        {actionLabel && (
          <span
            className={cn(
              "flex shrink-0 items-center gap-0.5 font-semibold",
              config.action,
              interactive && "group-hover:underline"
            )}
          >
            {actionLabel}
            <ArrowUpRight className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </>
  );

  // The whole card reads as clickable, so make the whole card the target
  // instead of leaving only the footer label hittable.
  const className = cn(
    "ts-stat-card group text-left",
    interactive && [
      config.hover,
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    ]
  );

  if (actionHref) {
    return (
      <Link href={actionHref} className={className}>
        {body}
      </Link>
    );
  }

  if (onAction) {
    return (
      <button type="button" onClick={onAction} className={className}>
        {body}
      </button>
    );
  }

  return <div className={className}>{body}</div>;
}
