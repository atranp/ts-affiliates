"use client";

import { ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { affiliateBadgeClass } from "@/components/affiliate/AffiliateBadge";
import {
  AffiliateCompactStat,
  AffiliateEmptyState,
  AffiliateHomeCard,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { cn } from "@/lib/utils";
import type { AffiliateVisits } from "@/lib/affiliate/reach";

/**
 * Referral traffic: headline counts, a 30-day trend, and the individual clicks.
 *
 * The WordPress portal lists every visit row, so the rows are here for parity
 * rather than only a rollup — an affiliate checking whether a specific post is
 * working needs to see landing pages, not a total.
 */

function formatCount(value: number): string {
  return value.toLocaleString("en-US");
}

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

/** Bare hostname, or "Direct" when the click carried no referrer. */
function sourceOf(url: string | null): string {
  if (!url) return "Direct";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function formatDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function formatWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/**
 * A bar per day, scaled to the busiest one. Deliberately CSS rather than a
 * charting dependency — it is one series of thirty values.
 */
function VisitTrend({ daily }: { daily: AffiliateVisits["daily"] }) {
  const peak = Math.max(...daily.map((day) => day.visits), 1);

  return (
    <div className="flex h-28 items-end gap-[3px]" role="img"
      aria-label={`Clicks per day over the last ${daily.length} days`}
    >
      {daily.map((day) => (
        <div
          key={day.date}
          className="group relative flex h-full flex-1 items-end"
          title={`${formatDay(day.date)}: ${formatCount(day.visits)} clicks, ${day.converted} converted`}
        >
          <div
            className="w-full rounded-sm bg-primary/25 transition-colors group-hover:bg-primary/50"
            style={{ height: `${Math.max((day.visits / peak) * 100, 2)}%` }}
          />
        </div>
      ))}
    </div>
  );
}

export function StatsPanel({
  data,
  page,
  onPageChange,
  isFetching,
}: {
  data: AffiliateVisits;
  page: number;
  onPageChange: (page: number) => void;
  isFetching: boolean;
}) {
  const copy = AFFILIATE_COPY.visits;
  const { stats, daily, recent } = data;

  const lastPage = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div className="flex min-h-0 flex-col gap-4">
      <div className="grid min-w-0 max-w-full shrink-0 grid-cols-2 gap-3 lg:grid-cols-4 lg:gap-4">
        <AffiliateCompactStat
          label={copy.stats.total}
          value={formatCount(stats.total)}
        />
        <AffiliateCompactStat
          label={copy.stats.last7}
          value={formatCount(stats.last7Days)}
          tone="primary"
        />
        <AffiliateCompactStat
          label={copy.stats.last30}
          value={formatCount(stats.last30Days)}
          tone="primary"
        />
        <AffiliateCompactStat
          label={copy.stats.converted}
          value={
            stats.conversionRate === null
              ? formatCount(stats.converted)
              : `${formatCount(stats.converted)} · ${stats.conversionRate.toFixed(1)}%`
          }
          tone="success"
        />
      </div>

      {daily.length > 0 && (
        <AffiliateHomeCard
          title={copy.trendTitle}
          description={copy.trendDescription}
          className="shrink-0"
        >
          <VisitTrend daily={daily} />
          <div className="mt-2 flex justify-between text-[11px] text-muted-foreground">
            <span>{formatDay(daily[0].date)}</span>
            <span>{formatDay(daily[daily.length - 1].date)}</span>
          </div>
        </AffiliateHomeCard>
      )}

      <AffiliateHomeCard
        title={copy.recentTitle}
        description={copy.recentDescription}
        className={cn("min-h-0", isFetching && "opacity-70")}
      >
        {recent.length === 0 ? (
          <AffiliateEmptyState>{copy.empty}</AffiliateEmptyState>
        ) : (
          <>
            <AffiliateListPanel inset>
              <ul className="divide-y divide-border/60">
                {recent.map((visit) => (
                  <li
                    key={visit.id}
                    className="flex items-center justify-between gap-3 px-3 py-2.5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-mono text-xs text-brand-dark">
                        {pathOf(visit.landingUrl)}
                      </p>
                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                        <ArrowUpRight className="h-3 w-3" aria-hidden />
                        {sourceOf(visit.referrerUrl)}
                      </p>
                    </div>

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
              <div className="mt-3 flex items-center justify-between gap-3">
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
