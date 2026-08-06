import {
  addStoreDays,
  endOfStoreDay,
  endOfStoreMonth,
  endOfStoreWeek,
  formatStoreDate,
  formatStoreDateInput,
  parseStoreDateInput,
  startOfStoreDay,
  startOfStoreMonth,
  startOfStoreWeek,
  storeYear,
} from "./store-dates";

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
  const today = startOfStoreDay(now);

  switch (preset) {
    case "this_week":
      return {
        from: startOfStoreWeek(today),
        to: endOfStoreWeek(today),
        payoutWeek: endOfStoreDay(today),
        label: "This week",
      };
    case "last_week": {
      const lastWeek = addStoreDays(today, -7);
      return {
        from: startOfStoreWeek(lastWeek),
        to: endOfStoreWeek(lastWeek),
        payoutWeek: endOfStoreWeek(lastWeek),
        label: "Last week",
      };
    }
    case "this_month":
      return {
        from: startOfStoreMonth(today),
        to: endOfStoreMonth(today),
        payoutWeek: endOfStoreDay(today),
        label: "This month",
      };
    case "all":
    default:
      return {
        from: null,
        to: null,
        payoutWeek: endOfStoreDay(today),
        label: "All time",
      };
  }
}

export function formatPeriodLabel(from: Date | null, to: Date | null) {
  if (!from || !to) return "All time";
  const fromStr = formatStoreDate(from, "MMM d");
  const toStr = formatStoreDate(
    to,
    storeYear(from) !== storeYear(to) ? "MMM d, yyyy" : "MMM d"
  );
  return `${fromStr} – ${toStr}`;
}

export function toDateInputValue(date: Date) {
  return formatStoreDateInput(date);
}

export function defaultPayoutPeriodStart(now = new Date()) {
  return startOfStoreWeek(now);
}

export function defaultPayoutPeriodEnd(now = new Date()) {
  return startOfStoreDay(now);
}

export function parsePayoutPeriod(startInput: string, endInput: string) {
  const periodStart = parseStoreDateInput(startInput);
  const periodEnd = endOfStoreDay(parseStoreDateInput(endInput));

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
