import {
  endOfUtcDay,
  parseUtcDateInput,
  startOfUtcDay,
} from "./utc-dates";

export function resolvePayoutPeriodFromRequest(options: {
  periodStart?: string | null;
  periodEnd?: string | null;
  payoutWeek?: string | null;
}) {
  const endInput = options.periodEnd ?? options.payoutWeek;
  if (!endInput) {
    const today = startOfUtcDay(new Date());
    return { periodStart: today, periodEnd: endOfUtcDay(today) };
  }

  const periodEnd = endOfUtcDay(parseUtcDateInput(endInput));
  if (Number.isNaN(periodEnd.getTime())) {
    throw new Error("Invalid end date");
  }

  if (options.periodStart) {
    const periodStart = parseUtcDateInput(options.periodStart);
    if (Number.isNaN(periodStart.getTime())) {
      throw new Error("Invalid start date");
    }
    if (periodStart > periodEnd) {
      throw new Error("Start date must be on or before end date");
    }
    return { periodStart, periodEnd };
  }

  return { periodStart: parseUtcDateInput(endInput), periodEnd };
}
