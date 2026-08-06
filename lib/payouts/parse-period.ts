import {
  endOfStoreDay,
  parseStoreDateInput,
  startOfStoreDay,
} from "./store-dates";

export function resolvePayoutPeriodFromRequest(options: {
  periodStart?: string | null;
  periodEnd?: string | null;
  payoutWeek?: string | null;
}) {
  const endInput = options.periodEnd ?? options.payoutWeek;
  if (!endInput) {
    const today = startOfStoreDay(new Date());
    return { periodStart: today, periodEnd: endOfStoreDay(today) };
  }

  const periodEnd = endOfStoreDay(parseStoreDateInput(endInput));
  if (Number.isNaN(periodEnd.getTime())) {
    throw new Error("Invalid end date");
  }

  if (options.periodStart) {
    const periodStart = parseStoreDateInput(options.periodStart);
    if (Number.isNaN(periodStart.getTime())) {
      throw new Error("Invalid start date");
    }
    if (periodStart > periodEnd) {
      throw new Error("Start date must be on or before end date");
    }
    return { periodStart, periodEnd };
  }

  return { periodStart: parseStoreDateInput(endInput), periodEnd };
}
