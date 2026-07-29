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
  const display =
    typeof value === "number" ? formatCurrency(value) : value;
  const config = toneConfig[tone];

  const actionContent = actionLabel ? (
    <span
      className={cn(
        "flex items-center gap-0.5 font-semibold hover:underline",
        config.action
      )}
    >
      {actionLabel}
      <ArrowUpRight className="h-3.5 w-3.5" />
    </span>
  ) : null;

  return (
    <div className={cn("ts-stat-card group", config.hover)}>
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
      <div className="flex items-center justify-between border-t border-border/60 pt-2 text-xs text-muted-foreground">
        <span>{hint}</span>
        {actionHref ? (
          <Link href={actionHref}>{actionContent}</Link>
        ) : onAction ? (
          <button type="button" onClick={onAction}>
            {actionContent}
          </button>
        ) : null}
      </div>
    </div>
  );
}
