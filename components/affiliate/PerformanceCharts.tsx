"use client";

import { AffiliateEmptyState } from "@/components/affiliate/primitives";
import type {
  DayOfWeekPoint,
  PerformancePoint,
  SalesAttribution,
} from "@/lib/affiliate/performance";
import { cn, formatCurrency } from "@/lib/utils";

/**
 * Charts for the affiliate dashboard, drawn with CSS rather than a charting
 * dependency. These are one or two short series with no axes, zoom or legend
 * interaction to speak of, and the existing traffic sparkline already sets the
 * precedent.
 */

function formatDay(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

const countFormat = (value: number) => value.toLocaleString("en-US");

/** Gives a non-zero value a visible bar even when the peak dwarfs it. */
function barHeight(value: number, peak: number): string {
  if (value <= 0) return "2%";
  return `${Math.max((value / peak) * 100, 4)}%`;
}

export function EarningsTrend({
  daily,
  className,
}: {
  daily: PerformancePoint[];
  className?: string;
}) {
  const peak = Math.max(...daily.map((point) => point.earnings), 1);
  const hasEarnings = daily.some((point) => point.earnings > 0);

  if (!hasEarnings) {
    return (
      <AffiliateEmptyState>
        No commissions in this period yet.
      </AffiliateEmptyState>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex h-32 items-end gap-[3px]"
        role="img"
        aria-label={`Earnings per day across ${daily.length} days`}
      >
        {daily.map((point) => (
          <div
            key={point.date}
            className="group flex h-full flex-1 items-end"
            title={`${formatDay(point.date)}: ${formatCurrency(point.earnings)}`}
          >
            <div
              className="w-full rounded-sm bg-primary/70 transition-colors group-hover:bg-primary"
              style={{ height: barHeight(point.earnings, peak) }}
            />
          </div>
        ))}
      </div>
      <AxisLabels daily={daily} />
    </div>
  );
}

/**
 * Clicks with the converting share stacked inside them, so the eye reads sales
 * as a portion of traffic rather than as a second unrelated series. Sales are
 * scaled to the click axis for the same reason — a true second axis would let
 * two sales look like two hundred clicks.
 */
export function ClicksAndSalesTrend({
  daily,
  className,
}: {
  daily: PerformancePoint[];
  className?: string;
}) {
  const peakClicks = Math.max(...daily.map((point) => point.clicks), 1);
  const peakSales = Math.max(...daily.map((point) => point.sales), 1);
  const hasTraffic = daily.some(
    (point) => point.clicks > 0 || point.sales > 0
  );

  if (!hasTraffic) {
    return (
      <AffiliateEmptyState>
        No clicks in this period yet. Share your link to start tracking traffic.
      </AffiliateEmptyState>
    );
  }

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div
        className="flex h-32 items-end gap-[3px]"
        role="img"
        aria-label={`Clicks and sales per day across ${daily.length} days`}
      >
        {daily.map((point) => (
          <div
            key={point.date}
            className="group relative flex h-full flex-1 items-end"
            title={`${formatDay(point.date)}: ${countFormat(point.clicks)} clicks, ${countFormat(point.sales)} sales`}
          >
            <div
              className="w-full rounded-sm bg-primary/25 transition-colors group-hover:bg-primary/40"
              style={{ height: barHeight(point.clicks, peakClicks) }}
            />
            {point.sales > 0 ? (
              <div
                className="absolute bottom-0 w-full rounded-sm bg-emerald-600"
                style={{
                  height: `${Math.max((point.sales / peakSales) * 34, 6)}%`,
                }}
              />
            ) : null}
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <AxisLabels daily={daily} className="flex-1" />
        <div className="flex shrink-0 items-center gap-3 text-[11px] text-muted-foreground">
          <Key className="bg-primary/25" label="Clicks" />
          <Key className="bg-emerald-600" label="Sales" />
        </div>
      </div>
    </div>
  );
}

function Key({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={cn("h-2 w-2 rounded-sm", className)} aria-hidden />
      {label}
    </span>
  );
}

function AxisLabels({
  daily,
  className,
}: {
  daily: PerformancePoint[];
  className?: string;
}) {
  if (daily.length === 0) return null;

  return (
    <div
      className={cn(
        "flex justify-between text-[11px] text-muted-foreground",
        className
      )}
    >
      <span>{formatDay(daily[0].date)}</span>
      <span>{formatDay(daily[daily.length - 1].date)}</span>
    </div>
  );
}

/**
 * Which days actually earn. Horizontal bars because seven labelled rows read
 * more easily than seven vertical columns, and it survives a phone width.
 *
 * Only clicks are drawn as a bar. Sales are two orders of magnitude smaller, so
 * any bar wide enough to see would be on a scale of its own sitting inside a
 * track that means something else — the numbers are given as numbers instead.
 */
export function DayOfWeekBars({
  data,
  className,
}: {
  data: DayOfWeekPoint[];
  className?: string;
}) {
  const peak = Math.max(...data.map((point) => point.clicks), 1);
  const busiest = data.reduce((best, point) =>
    point.clicks > best.clicks ? point : best
  );

  if (busiest.clicks === 0) {
    return (
      <AffiliateEmptyState>
        Not enough traffic yet to show a weekly pattern.
      </AffiliateEmptyState>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="space-y-1.5">
        <div className="flex items-center gap-2.5 pb-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          <span className="w-8 shrink-0" />
          <span className="flex-1" />
          <span className="w-11 shrink-0 text-right">Clicks</span>
          <span className="w-9 shrink-0 text-right">Sales</span>
        </div>

        {data.map((point) => (
          <div key={point.day} className="flex items-center gap-2.5">
            <span className="w-8 shrink-0 text-[11px] font-medium text-muted-foreground">
              {point.label}
            </span>
            <div
              className="h-4 flex-1 overflow-hidden rounded bg-muted/60"
              title={`${point.label}: ${countFormat(point.clicks)} clicks, ${countFormat(point.sales)} sales`}
            >
              <div
                className={cn(
                  "h-full rounded",
                  point === busiest ? "bg-primary/50" : "bg-primary/25"
                )}
                style={{ width: `${(point.clicks / peak) * 100}%` }}
              />
            </div>
            <span className="w-11 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">
              {countFormat(point.clicks)}
            </span>
            <span
              className={cn(
                "w-9 shrink-0 text-right text-[11px] font-medium tabular-nums",
                point.sales > 0 ? "text-emerald-700" : "text-muted-foreground/50"
              )}
            >
              {countFormat(point.sales)}
            </span>
          </div>
        ))}
      </div>

      <p className="rounded-lg border border-border/60 bg-primary/5 p-2.5 text-xs leading-relaxed text-brand-dark">
        <span className="font-semibold">{busiest.label} is your busiest day</span>
        {" — "}
        {countFormat(busiest.clicks)} clicks and {countFormat(busiest.sales)}{" "}
        {busiest.sales === 1 ? "sale" : "sales"}.
      </p>
    </div>
  );
}

/**
 * How sales reached us, split only as far as the data can actually prove.
 *
 * A commission either carries the click that produced it or it does not; there
 * is no coupon code recorded against the sale, so guessing at a third bucket
 * would be presenting an inference as a fact.
 */
export function AttributionBars({
  attribution,
  className,
}: {
  attribution: SalesAttribution;
  className?: string;
}) {
  const total = attribution.tracked + attribution.untracked;

  if (total === 0) {
    return (
      <AffiliateEmptyState>
        No sales in this period yet.
      </AffiliateEmptyState>
    );
  }

  const rows = [
    {
      label: "Traced to a link click",
      value: attribution.tracked,
      bar: "bg-primary",
    },
    {
      label: "No click recorded",
      value: attribution.untracked,
      bar: "bg-muted-foreground/35",
    },
  ];

  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      <div className="space-y-3">
        {rows.map((row) => (
          <div key={row.label}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="font-medium text-brand-dark">{row.label}</span>
              <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
                {countFormat(row.value)}{" "}
                {row.value === 1 ? "sale" : "sales"} ·{" "}
                {Math.round((row.value / total) * 100)}%
              </span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-muted/60">
              <div
                className={cn("h-full rounded-full", row.bar)}
                style={{ width: `${(row.value / total) * 100}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {attribution.untracked > 0 ? (
        <p className="rounded-lg border border-border/60 bg-muted/25 p-2.5 text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-brand-dark">
            You are paid the same either way.
          </span>{" "}
          Sales with no click usually came from a discount code, a browser that
          dropped the referral before checkout, or a customer you referred on an
          earlier order.
        </p>
      ) : null}
    </div>
  );
}
