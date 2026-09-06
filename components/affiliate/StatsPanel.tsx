"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { affiliateBadgeClass } from "@/components/affiliate/AffiliateBadge";
import { AffiliateStatCard } from "@/components/affiliate/AffiliateStatCard";
import {
  ClicksAndSalesTrend,
  DayOfWeekBars,
} from "@/components/affiliate/PerformanceCharts";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
import type { VisitOutcomeFilter } from "@/hooks/use-affiliate-reach";
import type { PerformanceResponse } from "@/hooks/use-performance";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { AffiliateVisits } from "@/lib/affiliate/reach";
import { cn } from "@/lib/utils";

/**
 * Referral traffic for the chosen period, then the individual clicks.
 *
 * The rows stay because an affiliate checking whether a specific post is
 * working needs to see landing pages, not a total. The referrer column does
 * not: better than nine in ten clicks arrive with no referrer at all, because
 * in-app browsers strip it, so a "top sources" list would be a chart of one
 * enormous "Direct" bar and a rounding error.
 */

const countFormat = (value: number) => value.toLocaleString("en-US");

/** Path only: the domain is the same on every row and just adds noise. */
function pathOf(url: string | null): string {
  if (!url) return "—";
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || "/";
  } catch {
    return url;
  }
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

const OUTCOME_OPTIONS: Array<{ key: VisitOutcomeFilter; label: string }> = [
  { key: "all", label: "All clicks" },
  { key: "converted", label: "Led to a sale" },
  { key: "none", label: "No sale" },
];

export function StatsPanel({
  data,
  performance,
  periodLabel,
  outcome,
  onOutcomeChange,
  page,
  onPageChange,
  isFetching,
}: {
  data: AffiliateVisits;
  performance?: PerformanceResponse;
  periodLabel: string;
  outcome: VisitOutcomeFilter;
  onOutcomeChange: (value: VisitOutcomeFilter) => void;
  page: number;
  onPageChange: (page: number) => void;
  isFetching: boolean;
}) {
  const copy = AFFILIATE_COPY.visits;
  const perf = AFFILIATE_COPY.performance;
  const { recent } = data;

  const current = performance?.current;
  const attribution = performance?.attribution;

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  const change = (now?: number | null, before?: number | null) => {
    if (now === null || now === undefined) return null;
    if (before === null || before === undefined || before === 0) return null;
    return ((now - before) / before) * 100;
  };

  const delta = (key: "clicks" | "sales" | "conversionRate") =>
    change(performance?.current[key], performance?.previous?.[key]);

  // No `min-h-0` anywhere down this column: the tab scrolls, so these have to
  // keep their natural height. Letting them shrink hands the flex parent room
  // to squash the click list and clip it behind the card's `overflow: hidden`.
  return (
    <div className="flex flex-col gap-4">
      <div className="grid min-w-0 max-w-full shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <AffiliateStatCard
          compact
          label={perf.clicks}
          value={current ? countFormat(current.clicks) : "—"}
          delta={delta("clicks")}
        />
        <AffiliateStatCard
          compact
          label={perf.salesFromClicks}
          value={attribution ? countFormat(attribution.tracked) : "—"}
          tone="success"
          delta={change(
            attribution?.tracked,
            performance?.previousAttribution?.tracked,
          )}
        />
        <AffiliateStatCard
          compact
          label={perf.conversion}
          value={
            current?.conversionRate === null ||
            current?.conversionRate === undefined
              ? "—"
              : `${current.conversionRate.toFixed(1)}%`
          }
          delta={delta("conversionRate")}
        />
        <AffiliateStatCard
          compact
          label={perf.untracedSales}
          value={attribution ? countFormat(attribution.untracked) : "—"}
        />
      </div>

      <div className="ts-home-split shrink-0">
        <AffiliateHomeCard
          title={copy.trendTitle}
          description={`${copy.trendDescription} · ${periodLabel}`}
        >
          {performance ? (
            <ClicksAndSalesTrend daily={performance.daily} />
          ) : (
            <div className="h-32 animate-pulse rounded-lg bg-muted/20" />
          )}
        </AffiliateHomeCard>

        <AffiliateHomeCard
          title={perf.weekTitle}
          description={perf.weekDescription}
        >
          {performance ? (
            <DayOfWeekBars data={performance.byDayOfWeek} />
          ) : (
            <div className="h-40 animate-pulse rounded-lg bg-muted/20" />
          )}
        </AffiliateHomeCard>
      </div>

      <AffiliateHomeCard
        title={copy.recentTitle}
        description={copy.recentDescription}
        className={cn(isFetching && "opacity-70")}
      >
        <div className="mb-3 flex shrink-0 flex-wrap items-center gap-2">
          <div className="ts-segment" role="group" aria-label="Click outcome">
            {OUTCOME_OPTIONS.map((option) => (
              <button
                key={option.key}
                type="button"
                aria-pressed={outcome === option.key}
                onClick={() => onOutcomeChange(option.key)}
                className={cn(
                  "ts-segment-item whitespace-nowrap",
                  outcome === option.key
                    ? "ts-segment-item-active"
                    : "ts-segment-item-inactive"
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <p className="ts-row-meta">
            {countFormat(data.total)}{" "}
            {data.total === 1 ? "click" : "clicks"}
          </p>
        </div>

        {recent.length === 0 ? (
          <AffiliateEmptyState>
            {outcome === "all"
              ? copy.empty
              : "No clicks match this filter yet."}
          </AffiliateEmptyState>
        ) : (
          <>
            <AffiliateListPanel inset>
              <ul className="divide-y divide-border/60">
                {recent.map((visit) => (
                  <li
                    key={visit.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <p className="min-w-0 flex-1 truncate font-mono text-xs text-brand-dark">
                      {pathOf(visit.landingUrl)}
                    </p>

                    <div className="flex shrink-0 items-center gap-2">
                      {visit.converted && (
                        <span className={affiliateBadgeClass("paid")}>
                          {copy.convertedBadge}
                        </span>
                      )}
                      <span className="whitespace-nowrap text-[11px] text-muted-foreground">
                        {formatWhen(visit.occurredAt)}
                      </span>
                    </div>
                  </li>
                ))}
              </ul>
            </AffiliateListPanel>

            {lastPage > 1 && (
              <div className="mt-3 flex shrink-0 items-center justify-between gap-3">
                <p className="text-xs text-muted-foreground">
                  {copy.pageOf(page, lastPage)}
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page <= 1 || isFetching}
                    onClick={() => onPageChange(page - 1)}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {copy.previous}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={page >= lastPage || isFetching}
                    onClick={() => onPageChange(page + 1)}
                  >
                    {copy.next}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </AffiliateHomeCard>
    </div>
  );
}
