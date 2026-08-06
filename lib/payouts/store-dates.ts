import {
  addDays,
  endOfDay,
  endOfMonth,
  endOfWeek,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";
import { APP_TIMEZONE } from "@/lib/timezone";

/**
 * Payout periods and sale dates use the store timezone so admins and ambassadors
 * see the same calendar days as WooCommerce / SliceWP. Boundaries are computed
 * in a fixed IANA zone so results do not depend on where the server runs.
 */

export function startOfStoreDay(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(startOfDay(zoned), APP_TIMEZONE);
}

export function endOfStoreDay(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(endOfDay(zoned), APP_TIMEZONE);
}

export function addStoreDays(date: Date, days: number): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(addDays(zoned, days), APP_TIMEZONE);
}

/** Weeks start on Monday, matching the WEEKLY_MONDAY payout schedule. */
export function startOfStoreWeek(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(
    startOfWeek(zoned, { weekStartsOn: 1 }),
    APP_TIMEZONE
  );
}

export function endOfStoreWeek(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(endOfWeek(zoned, { weekStartsOn: 1 }), APP_TIMEZONE);
}

export function startOfStoreMonth(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(startOfMonth(zoned), APP_TIMEZONE);
}

export function endOfStoreMonth(date: Date): Date {
  const zoned = toZonedTime(date, APP_TIMEZONE);
  return fromZonedTime(endOfMonth(zoned), APP_TIMEZONE);
}

/** Strictly after the given date, so a Monday maps to the following Monday. */
export function nextStoreMonday(date: Date): Date {
  const day = startOfStoreDay(date);
  const zoned = toZonedTime(day, APP_TIMEZONE);
  const weekday = zoned.getDay();
  const daysAhead = (8 - weekday) % 7 || 7;
  return addStoreDays(day, daysAhead);
}

/** Reads a `<input type="date">` value as a store-calendar day. */
export function parseStoreDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return new Date(NaN);
  return fromZonedTime(`${match[1]}-${match[2]}-${match[3]}T00:00:00`, APP_TIMEZONE);
}

/** Formats for `<input type="date">` in the store timezone. */
export function formatStoreDateInput(date: Date): string {
  return formatInTimeZone(date, APP_TIMEZONE, "yyyy-MM-dd");
}

export function formatStoreDate(
  date: Date,
  formatStr = "MMM d"
): string {
  return formatInTimeZone(date, APP_TIMEZONE, formatStr);
}

export function storeYear(date: Date): number {
  return Number(formatInTimeZone(date, APP_TIMEZONE, "yyyy"));
}

/** @deprecated Use startOfStoreDay */
export const startOfUtcDay = startOfStoreDay;
/** @deprecated Use endOfStoreDay */
export const endOfUtcDay = endOfStoreDay;
/** @deprecated Use addStoreDays */
export const addUtcDays = addStoreDays;
/** @deprecated Use startOfStoreWeek */
export const startOfUtcWeek = startOfStoreWeek;
/** @deprecated Use endOfStoreWeek */
export const endOfUtcWeek = endOfStoreWeek;
/** @deprecated Use startOfStoreMonth */
export const startOfUtcMonth = startOfStoreMonth;
/** @deprecated Use endOfStoreMonth */
export const endOfUtcMonth = endOfStoreMonth;
/** @deprecated Use nextStoreMonday */
export const nextUtcMonday = nextStoreMonday;
/** @deprecated Use parseStoreDateInput */
export const parseUtcDateInput = parseStoreDateInput;
/** @deprecated Use formatStoreDateInput */
export const formatUtcDateInput = formatStoreDateInput;
/** @deprecated Use formatStoreDate */
export const formatUtcDate = formatStoreDate;
