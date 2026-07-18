import { addDays, nextMonday, startOfDay } from "date-fns";
import { PayoutSchedule } from "@prisma/client";

export function getNextPayoutWeek(
  schedule: PayoutSchedule,
  fromDate = new Date()
): Date {
  const base = startOfDay(fromDate);

  switch (schedule) {
    case PayoutSchedule.WEEKLY_MONDAY:
      return startOfDay(nextMonday(base));
    case PayoutSchedule.BIWEEKLY:
      return startOfDay(nextMonday(addDays(base, 7)));
    case PayoutSchedule.MONTHLY:
      return startOfDay(nextMonday(addDays(base, 28)));
    default:
      return startOfDay(nextMonday(base));
  }
}

export function formatPayoutWeek(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
