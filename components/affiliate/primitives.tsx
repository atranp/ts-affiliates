import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AffiliateHomeCardProps = {
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
  children: React.ReactNode;
  className?: string;
  contentClassName?: string;
  /** Scroll inner content (teams section on home). */
  scrollContent?: boolean;
  fill?: boolean;
};

export function AffiliateHomeCard({
  title,
  description,
  actionLabel,
  onAction,
  children,
  className,
  contentClassName,
  scrollContent = false,
  fill = false,
}: AffiliateHomeCardProps) {
  return (
    <section
      className={cn(
        "ts-home-card",
        fill && "flex min-h-0 flex-col overflow-hidden",
        className
      )}
    >
      <header className="flex shrink-0 items-start justify-between gap-3 px-5 pt-5 pb-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold tracking-tight text-brand-dark">
            {title}
          </h3>
          {description ? (
            <p className="mt-0.5 text-sm leading-snug text-muted-foreground">
              {description}
            </p>
          ) : null}
        </div>
        {actionLabel && onAction ? (
          <button
            type="button"
            onClick={onAction}
            className="ts-text-link -mr-1 shrink-0 px-1 py-0.5"
          >
            {actionLabel}
            <ChevronRight className="h-3.5 w-3.5" aria-hidden />
          </button>
        ) : null}
      </header>
      <div
        className={cn(
          "px-5 pb-5",
          scrollContent && "min-h-0 flex-1 overflow-y-auto overscroll-contain",
          contentClassName
        )}
      >
        {children}
      </div>
    </section>
  );
}

export function AffiliateSectionLabel({
  children,
  className,
  action,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "mb-2 flex items-center justify-between gap-3",
        className
      )}
    >
      <p className="ts-section-label">{children}</p>
      {action}
    </div>
  );
}

export function AffiliateCompactStat({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: string;
  tone?: "default" | "primary" | "success" | "warning";
  className?: string;
}) {
  const valueClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "warning"
          ? "text-amber-700"
          : "text-brand-dark";

  return (
    <div className={cn("ts-compact-stat", className)}>
      <p className="ts-compact-stat-label">{label}</p>
      <p className={cn("ts-compact-stat-value", valueClass)}>{value}</p>
    </div>
  );
}

export function AffiliateMetaLine({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("ts-meta-line", className)}>{children}</div>;
}

export function AffiliateMetaHighlight({
  icon: Icon,
  children,
}: {
  icon?: LucideIcon;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-medium text-brand-dark">
      {Icon ? <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function AffiliateListPanel({
  children,
  scroll = false,
  className,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "ts-list-panel",
        scroll && "ts-list-panel-scroll",
        className
      )}
    >
      {children}
    </div>
  );
}

export function AffiliateEmptyState({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("ts-empty-inline", className)}>
      <p className="leading-relaxed">{children}</p>
    </div>
  );
}

export function AffiliateAmountCell({
  amount,
  sublabel,
  tone = "default",
}: {
  amount: string;
  sublabel?: string;
  tone?: "default" | "primary" | "success" | "warning";
}) {
  const valueClass =
    tone === "primary"
      ? "text-primary"
      : tone === "success"
        ? "text-emerald-700"
        : tone === "warning"
        ? "text-amber-700"
        : "text-brand-dark";

  return (
    <div className="shrink-0 text-right">
      <p className={cn("text-sm font-semibold tabular-nums", valueClass)}>
        {amount}
      </p>
      {sublabel ? (
        <p className="text-[10px] text-muted-foreground">{sublabel}</p>
      ) : null}
    </div>
  );
}
