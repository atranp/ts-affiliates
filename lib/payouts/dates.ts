import {
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subWeeks,
} from "date-fns";

export type DatePreset = "this_week" | "last_week" | "this_month" | "all";

export type DateRange = {
  from: Date | null;
  to: Date | null;
  payoutWeek: Date;
  label: string;
};

export function resolveDatePreset(preset: DatePreset, now = new Date()): DateRange {
  const today = startOfDay(now);

  switch (preset) {
    case "this_week":
      return {
        from: startOfWeek(today, { weekStartsOn: 1 }),
        to: endOfWeek(today, { weekStartsOn: 1 }),
        payoutWeek: endOfDay(today),
        label: "This week",
      };
    case "last_week": {
      const lastWeek = subWeeks(today, 1);
      return {
        from: startOfWeek(lastWeek, { weekStartsOn: 1 }),
        to: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        payoutWeek: endOfWeek(lastWeek, { weekStartsOn: 1 }),
        label: "Last week",
      };
    }
    case "this_month":
      return {
        from: startOfMonth(today),
        to: endOfMonth(today),
        payoutWeek: endOfDay(today),
        label: "This month",
      };
    case "all":
    default:
      return {
        from: null,
        to: null,
        payoutWeek: endOfDay(today),
        label: "All time",
      };
  }
}

export function formatPeriodLabel(from: Date | null, to: Date | null) {
  if (!from || !to) return "All time";
  const opts: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  const fromStr = from.toLocaleDateString("en-US", opts);
  const toStr = to.toLocaleDateString("en-US", {
    ...opts,
    year: from.getFullYear() !== to.getFullYear() ? "numeric" : undefined,
  });
  return `${fromStr} – ${toStr}`;
}
