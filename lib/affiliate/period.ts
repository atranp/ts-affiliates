/**
 * Date windows shared by the affiliate dashboard's home, traffic and commissions
 * views, so a period chosen on one screen means the same thing on the next.
 *
 * Boundaries come from `store-dates`, which anchors them to the store timezone
 * rather than the viewer's. An ambassador in London and one in Los Angeles
 * comparing "this week" should be looking at the same sales.
 *
 * `to` is exclusive. Half-open ranges let consecutive periods abut without
 * double-counting a sale that lands exactly on midnight, and they map straight
 * onto Prisma's `{ gte, lt }`.
 */

import {
  addStoreDays,
  formatStoreDate,
  formatStoreDateInput,
  parseStoreDateInput,
  startOfStoreDay,
  startOfStoreMonth,
  startOfStoreWeek,
  storeYear,
} from "@/lib/payouts/store-dates";

export const PERIOD_KEYS = [
  "this-week",
  "last-week",
  "this-month",
  "last-30",
  "all",
  "custom",
] as const;

export type PeriodKey = (typeof PERIOD_KEYS)[number];

export const PERIOD_LABELS: Record<PeriodKey, string> = {
  "this-week": "This week",
  "last-week": "Last week",
  "this-month": "This month",
  "last-30": "Last 30 days",
  all: "All time",
  custom: "Custom",
};

/** The picker offers these in order; `custom` is reached through the date inputs. */
export const PERIOD_OPTIONS: PeriodKey[] = [
  "this-week",
  "last-week",
  "this-month",
  "last-30",
  "all",
];

export type PeriodRange = {
  /** Inclusive. */
  from: Date;
  /** Exclusive. */
  to: Date;
};

export type ResolvedPeriod = {
  key: PeriodKey;
  /** Null on "all time", where there is no lower bound to apply. */
  range: PeriodRange | null;
  /**
   * The window of identical length immediately before `range`, used for the
   * "vs last period" deltas. Null when the current window is unbounded, because
   * there is nothing meaningful to compare all of history against.
   */
  previous: PeriodRange | null;
  /** e.g. "Mar 24 – Mar 30". */
  label: string;
  /** e.g. "compared to Mar 17 – Mar 23"; null when there is no comparison. */
  comparisonLabel: string | null;
};

function isPeriodKey(value: string | null | undefined): value is PeriodKey {
  return !!value && (PERIOD_KEYS as readonly string[]).includes(value);
}

/** Start of the day after `date`, i.e. an exclusive "through today" bound. */
function endOfToday(now: Date): Date {
  return addStoreDays(startOfStoreDay(now), 1);
}

/**
 * Renders a half-open range as the inclusive days a person would say out loud:
 * a range ending Mar 31 00:00 covers through Mar 30.
 */
function formatRange(range: PeriodRange, now: Date): string {
  const lastDay = addStoreDays(range.to, -1);
  const sameDay = formatStoreDate(range.from) === formatStoreDate(lastDay);
  const spansYears =
    storeYear(range.from) !== storeYear(now) ||
    storeYear(lastDay) !== storeYear(now);

  const fmt = spansYears ? "MMM d, yyyy" : "MMM d";

  return sameDay
    ? formatStoreDate(range.from, fmt)
    : `${formatStoreDate(range.from, fmt)} – ${formatStoreDate(lastDay, fmt)}`;
}

function precedingRange(range: PeriodRange): PeriodRange {
  const span = range.to.getTime() - range.from.getTime();
  return { from: new Date(range.from.getTime() - span), to: range.from };
}

export type PeriodInput = {
  key?: string | null;
  /** `YYYY-MM-DD`, only read when the key is `custom`. */
  from?: string | null;
  to?: string | null;
  /** Used when `key` is missing or unrecognised. */
  fallback?: PeriodKey;
  now?: Date;
};

export function resolvePeriod({
  key,
  from,
  to,
  fallback = "last-30",
  now = new Date(),
}: PeriodInput = {}): ResolvedPeriod {
  const resolvedKey: PeriodKey = isPeriodKey(key) ? key : fallback;

  const build = (range: PeriodRange | null, k: PeriodKey): ResolvedPeriod => {
    const previous = range ? precedingRange(range) : null;
    return {
      key: k,
      range,
      previous,
      label: range ? formatRange(range, now) : "All time",
      comparisonLabel: previous
        ? `compared to ${formatRange(previous, now)}`
        : null,
    };
  };

  switch (resolvedKey) {
    case "this-week":
      return build(
        { from: startOfStoreWeek(now), to: endOfToday(now) },
        resolvedKey
      );

    case "last-week": {
      const thisWeek = startOfStoreWeek(now);
      return build(
        { from: addStoreDays(thisWeek, -7), to: thisWeek },
        resolvedKey
      );
    }

    case "this-month":
      return build(
        { from: startOfStoreMonth(now), to: endOfToday(now) },
        resolvedKey
      );

    case "last-30":
      return build(
        { from: addStoreDays(startOfStoreDay(now), -29), to: endOfToday(now) },
        resolvedKey
      );

    case "custom": {
      const start = from ? parseStoreDateInput(from) : null;
      const end = to ? parseStoreDateInput(to) : null;

      // A half-filled or malformed custom range is a user mid-edit, not an
      // error worth surfacing — fall back rather than render NaN dates.
      if (
        !start ||
        !end ||
        Number.isNaN(start.getTime()) ||
        Number.isNaN(end.getTime()) ||
        end < start
      ) {
        return resolvePeriod({ key: fallback, fallback, now });
      }

      return build({ from: start, to: addStoreDays(end, 1) }, "custom");
    }

    case "all":
    default:
      return build(null, "all");
  }
}

/** Reads the period out of URL search params. */
export function periodFromParams(
  params: {
    get(name: string): string | null;
  },
  options: { fallback?: PeriodKey; now?: Date } = {}
): ResolvedPeriod {
  return resolvePeriod({
    key: params.get("period"),
    from: params.get("from"),
    to: params.get("to"),
    fallback: options.fallback,
    now: options.now,
  });
}

/**
 * Params for a period, with defaults nulled out so the URL stays clean when the
 * view is showing its own default.
 */
export function periodToParams(
  period: ResolvedPeriod,
  fallback: PeriodKey
): Record<string, string | null> {
  if (period.key === "custom" && period.range) {
    return {
      period: "custom",
      from: formatStoreDateInput(period.range.from),
      to: formatStoreDateInput(addStoreDays(period.range.to, -1)),
    };
  }

  return {
    period: period.key === fallback ? null : period.key,
    from: null,
    to: null,
  };
}

/** Prisma date filter for a resolved period; `undefined` on all-time. */
export function periodWhere(
  range: PeriodRange | null
): { gte: Date; lt: Date } | undefined {
  return range ? { gte: range.from, lt: range.to } : undefined;
}
