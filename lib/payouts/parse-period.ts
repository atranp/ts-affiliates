import { endOfDay, startOfDay } from "date-fns";

export function resolvePayoutPeriodFromRequest(options: {
  periodStart?: string | null;
  periodEnd?: string | null;
  payoutWeek?: string | null;
}) {
  const endInput = options.periodEnd ?? options.payoutWeek;
  if (!endInput) {
    const today = startOfDay(new Date());
    return { periodStart: today, periodEnd: endOfDay(today) };
  }

  const periodEnd = endOfDay(new Date(endInput));
  if (Number.isNaN(periodEnd.getTime())) {
    throw new Error("Invalid end date");
  }

  if (options.periodStart) {
    const periodStart = startOfDay(new Date(options.periodStart));
    if (Number.isNaN(periodStart.getTime())) {
      throw new Error("Invalid start date");
    }
    if (periodStart > periodEnd) {
      throw new Error("Start date must be on or before end date");
    }
    return { periodStart, periodEnd };
  }

  return { periodStart: startOfDay(new Date(endInput)), periodEnd };
}
