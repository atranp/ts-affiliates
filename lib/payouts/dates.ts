import {
  addUtcDays,
  endOfUtcDay,
  endOfUtcMonth,
  endOfUtcWeek,
  formatUtcDate,
  formatUtcDateInput,
  parseUtcDateInput,
  startOfUtcDay,
  startOfUtcMonth,
  startOfUtcWeek,
} from "./utc-dates";

export type DatePreset = "this_week" | "last_week" | "this_month" | "all";

export type DateRange = {
  from: Date | null;
  to: Date | null;
  payoutWeek: Date;
  label: string;
};

export function resolveDatePreset(
  preset: DatePreset,
  now = new Date()
): DateRange {
  const today = startOfUtcDay(now);

  switch (preset) {
    case "this_week":
      return {
        from: startOfUtcWeek(today),
        to: endOfUtcWeek(today),
        payoutWeek: endOfUtcDay(today),
        label: "This week",
      };
    case "last_week": {
      const lastWeek = addUtcDays(today, -7);
      return {
        from: startOfUtcWeek(lastWeek),
        to: endOfUtcWeek(lastWeek),
        payoutWeek: endOfUtcWeek(lastWeek),
        label: "Last week",
      };
    }
    case "this_month":
      return {
        from: startOfUtcMonth(today),
        to: endOfUtcMonth(today),
        payoutWeek: endOfUtcDay(today),
        label: "This month",
      };
    case "all":
    default:
      return {
        from: null,
        to: null,
        payoutWeek: endOfUtcDay(today),
        label: "All time",
      };
  }
}

export function formatPeriodLabel(from: Date | null, to: Date | null) {
  if (!from || !to) return "All time";
  const fromStr = formatUtcDate(from);
  const toStr = formatUtcDate(to, {
    month: "short",
    day: "numeric",
    year:
      from.getUTCFullYear() !== to.getUTCFullYear() ? "numeric" : undefined,
  });
  return `${fromStr} – ${toStr}`;
}

export function toDateInputValue(date: Date) {
  return formatUtcDateInput(date);
}

export function defaultPayoutPeriodStart(now = new Date()) {
  return startOfUtcWeek(now);
}

export function defaultPayoutPeriodEnd(now = new Date()) {
  return startOfUtcDay(now);
}

export function parsePayoutPeriod(startInput: string, endInput: string) {
  const periodStart = parseUtcDateInput(startInput);
  const periodEnd = endOfUtcDay(parseUtcDateInput(endInput));

  if (
    Number.isNaN(periodStart.getTime()) ||
    Number.isNaN(periodEnd.getTime())
  ) {
    throw new Error("Invalid date range");
  }
  if (periodStart > periodEnd) {
    throw new Error("Start date must be on or before end date");
  }

  return { periodStart, periodEnd };
}
