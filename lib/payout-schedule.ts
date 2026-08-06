import { PayoutSchedule } from "@prisma/client";
import {
  addStoreDays,
  formatStoreDate,
  nextStoreMonday,
  startOfStoreDay,
} from "./payouts/store-dates";

/**
 * Resolved in the store timezone so a commission lands on the same payout week
 * as WooCommerce / SliceWP report it. See lib/payouts/store-dates.ts.
 */
export function getNextPayoutWeek(
  schedule: PayoutSchedule,
  fromDate = new Date()
): Date {
  const base = startOfStoreDay(fromDate);

  switch (schedule) {
    case PayoutSchedule.WEEKLY_MONDAY:
      return nextStoreMonday(base);
    case PayoutSchedule.BIWEEKLY:
      return nextStoreMonday(addStoreDays(base, 7));
    case PayoutSchedule.MONTHLY:
      return nextStoreMonday(addStoreDays(base, 28));
    default:
      return nextStoreMonday(base);
  }
}

export function formatPayoutWeek(date: Date): string {
  return formatStoreDate(date, "EEE, MMM d, yyyy");
}
