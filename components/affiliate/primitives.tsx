import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

type AffiliateHomeCardProps = {
  title: string;
  description?: React.ReactNode;
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
        'ts-home-card min-w-0 max-w-full',
        fill && 'flex min-h-0 flex-col',
        !fill && 'flex flex-col',
        className
      )}
    >
      <header className="ts-home-card-header flex shrink-0 flex-col gap-2 px-4 py-3.5 sm:px-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="ts-home-card-title min-w-0">{title}</h3>
          {actionLabel && onAction ? (
            <button
              type="button"
              onClick={onAction}
              className="ts-text-link shrink-0 px-0.5 py-1"
            >
              {actionLabel}
              <ChevronRight className="h-3.5 w-3.5" aria-hidden />
            </button>
          ) : null}
        </div>
        {description ? (
          <div className="ts-home-card-desc">{description}</div>
        ) : null}
      </header>
      <div
        className={cn(
          'ts-home-card-body px-4 py-4 sm:px-5',
          scrollContent && 'min-h-0 flex-1 overflow-y-auto overscroll-contain',
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
  subtitle,
}: {
  children: React.ReactNode;
  className?: string;
  action?: React.ReactNode;
  subtitle?: React.ReactNode;
}) {
  return (
    <div className={cn("mb-2.5", className)}>
      <div className="flex items-center justify-between gap-3">
        <p className="ts-section-label">{children}</p>
        {action}
      </div>
      {subtitle ? <div className="mt-1">{subtitle}</div> : null}
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
    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-dark">
      {Icon ? <Icon className="h-3.5 w-3.5 text-primary" aria-hidden /> : null}
      {children}
    </span>
  );
}

export function AffiliateListPanel({
  children,
  scroll = false,
  inset = false,
  className,
}: {
  children: React.ReactNode;
  scroll?: boolean;
  /** Lighter panel for use inside home cards */
  inset?: boolean;
  className?: string;
}) {
  return (
    <div
      className={cn(
        inset ? "ts-list-panel-inset" : "ts-list-panel",
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
      <p className={cn("ts-amount", valueClass)}>{amount}</p>
      {sublabel ? <p className="ts-amount-sub">{sublabel}</p> : null}
    </div>
  );
}
