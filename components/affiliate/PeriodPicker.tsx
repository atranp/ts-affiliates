"use client";

import { useState } from "react";
import { CalendarDays, Check } from "lucide-react";
import {
  PERIOD_LABELS,
  PERIOD_OPTIONS,
  type PeriodKey,
  type ResolvedPeriod,
} from "@/lib/affiliate/period";
import { formatStoreDateInput, addStoreDays } from "@/lib/payouts/store-dates";
import { APP_TIMEZONE_LABEL } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * The window every figure on the screen is measured over.
 *
 * One control shared by home, traffic and commissions, because a period that
 * silently means something different per tab is worse than no period at all.
 */
export function PeriodPicker({
  period,
  onChange,
  className,
}: {
  period: ResolvedPeriod;
  onChange: (next: {
    key: PeriodKey;
    from?: string;
    to?: string;
  }) => void;
  className?: string;
}) {
  const [customOpen, setCustomOpen] = useState(period.key === "custom");

  const customFrom = period.range ? formatStoreDateInput(period.range.from) : "";
  const customTo = period.range
    ? formatStoreDateInput(addStoreDays(period.range.to, -1))
    : "";

  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <div
          className="ts-segment w-full overflow-x-auto sm:w-auto"
          role="group"
          aria-label="Reporting period"
        >
          {PERIOD_OPTIONS.map((key) => (
            <button
              key={key}
              type="button"
              aria-pressed={period.key === key}
              onClick={() => {
                setCustomOpen(false);
                onChange({ key });
              }}
              className={cn(
                "ts-segment-item whitespace-nowrap",
                period.key === key
                  ? "ts-segment-item-active"
                  : "ts-segment-item-inactive"
              )}
            >
              {PERIOD_LABELS[key]}
            </button>
          ))}
          <button
            type="button"
            aria-pressed={period.key === "custom"}
            onClick={() => setCustomOpen((open) => !open)}
            className={cn(
              "ts-segment-item whitespace-nowrap",
              period.key === "custom"
                ? "ts-segment-item-active"
                : "ts-segment-item-inactive"
            )}
          >
            <CalendarDays className="mr-1 inline h-3.5 w-3.5" aria-hidden />
            {PERIOD_LABELS.custom}
          </button>
        </div>

        {/* Suppressed on all-time, where the label only repeats the button. */}
        {period.range ? (
          <p className="min-w-0 text-xs leading-relaxed">
            <span className="font-medium text-brand-dark">{period.label}</span>
            {period.comparisonLabel ? (
              <span className="text-muted-foreground">
                {" "}
                · {period.comparisonLabel}
              </span>
            ) : null}
          </p>
        ) : null}
      </div>

      {customOpen ? (
        <CustomRange
          from={customFrom}
          to={customTo}
          onApply={(from, to) => {
            onChange({ key: "custom", from, to });
            setCustomOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function CustomRange({
  from,
  to,
  onApply,
}: {
  from: string;
  to: string;
  onApply: (from: string, to: string) => void;
}) {
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);

  const valid = start !== "" && end !== "" && start <= end;

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-lg border border-border/60 bg-muted/20 p-3">
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        From
        <input
          type="date"
          value={start}
          max={end || undefined}
          onChange={(event) => setStart(event.target.value)}
          className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      <label className="flex flex-col gap-1 text-xs font-medium text-muted-foreground">
        To
        <input
          type="date"
          value={end}
          min={start || undefined}
          onChange={(event) => setEnd(event.target.value)}
          className="rounded-md border border-input bg-background px-2.5 py-1.5 text-sm text-foreground outline-none focus:border-primary"
        />
      </label>
      <button
        type="button"
        disabled={!valid}
        onClick={() => onApply(start, end)}
        className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
      >
        <Check className="h-3.5 w-3.5" aria-hidden />
        Apply
      </button>
      <p className="w-full text-xs leading-relaxed text-muted-foreground">
        Dates follow {APP_TIMEZONE_LABEL}, the same clock as your sales.
      </p>
    </div>
  );
}
