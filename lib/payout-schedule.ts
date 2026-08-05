import { PayoutSchedule } from "@prisma/client";
import {
  addUtcDays,
  formatUtcDate,
  nextUtcMonday,
  startOfUtcDay,
} from "./payouts/utc-dates";

/**
 * Resolved in UTC so a commission lands on the same payout week regardless of
 * which machine synced it. See lib/payouts/utc-dates.ts.
 */
export function getNextPayoutWeek(
  schedule: PayoutSchedule,
  fromDate = new Date()
): Date {
  const base = startOfUtcDay(fromDate);

  switch (schedule) {
    case PayoutSchedule.WEEKLY_MONDAY:
      return nextUtcMonday(base);
    case PayoutSchedule.BIWEEKLY:
      return nextUtcMonday(addUtcDays(base, 7));
    case PayoutSchedule.MONTHLY:
      return nextUtcMonday(addUtcDays(base, 28));
    default:
      return nextUtcMonday(base);
  }
}

export function formatPayoutWeek(date: Date): string {
  return formatUtcDate(date, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
