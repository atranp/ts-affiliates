import * as React from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";

/**
 * Wide tables become unreadable on a phone: the columns that matter most
 * (money, status) are the ones pushed off the right edge. These pieces render
 * the same rows as stacked cards, and `ResponsiveTable` keeps every screen
 * switching between the two at the same breakpoint.
 */
export function ResponsiveTable({
  table,
  cards,
}: {
  table: React.ReactNode;
  cards: React.ReactNode;
}) {
  return (
    <>
      <div className="hidden md:block">{table}</div>
      <div className="md:hidden">{cards}</div>
    </>
  );
}

export function DataCardList({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("space-y-2", className)}>{children}</div>;
}

type DataCardProps = {
  children: React.ReactNode;
  className?: string;
  href?: string;
  onClick?: () => void;
};

export function DataCard({ children, className, href, onClick }: DataCardProps) {
  const base = cn(
    "block rounded-xl border border-border/45 bg-card p-3.5 text-left shadow-xs",
    (href || onClick) &&
      "transition-all hover:border-border/80 hover:bg-muted/30 hover:shadow-xs active:bg-muted/40",
    className
  );

  if (href) {
    return (
      <Link href={href} className={base}>
        {children}
      </Link>
    );
  }

  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={cn(base, "w-full")}>
        {children}
      </button>
    );
  }

  return <div className={base}>{children}</div>;
}

/** Title on the left, the number people came for on the right. */
export function DataCardHeader({
  title,
  subtitle,
  value,
  valueHint,
}: {
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  value?: React.ReactNode;
  valueHint?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        {/* Wraps rather than truncates: these titles end in the order number,
            which is the part someone is usually looking for. */}
        <div className="line-clamp-2 text-sm font-medium text-brand-dark">
          {title}
        </div>
        {subtitle && (
          <div className="truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        )}
      </div>
      {(value || valueHint) && (
        <div className="shrink-0 text-right">
          {value && (
            <div className="font-semibold tabular-nums">{value}</div>
          )}
          {valueHint && (
            <div className="text-xs text-muted-foreground">{valueHint}</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Secondary facts that would each be their own column on desktop. */
export function DataCardMeta({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground",
        className
      )}
    >
      {children}
    </div>
  );
}
