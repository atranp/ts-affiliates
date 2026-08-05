/**
 * Payout periods are pinned to UTC.
 *
 * date-fns operates in the running process's timezone, which meant the same
 * logical payout Monday was stored differently depending on whether a row was
 * written by the Vercel cron (UTC) or from a developer machine. Entries in the
 * "wrong" bucket then fell outside the admin's selected range and were never
 * paid. Every payout boundary goes through these helpers so the answer no
 * longer depends on where the code happens to run.
 */

export function startOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
  );
}

export function endOfUtcDay(date: Date): Date {
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      23,
      59,
      59,
      999
    )
  );
}

export function addUtcDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** Weeks start on Monday, matching the WEEKLY_MONDAY payout schedule. */
export function startOfUtcWeek(date: Date): Date {
  const day = startOfUtcDay(date);
  const mondayOffset = (day.getUTCDay() + 6) % 7;
  return addUtcDays(day, -mondayOffset);
}

export function endOfUtcWeek(date: Date): Date {
  return endOfUtcDay(addUtcDays(startOfUtcWeek(date), 6));
}

export function startOfUtcMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

export function endOfUtcMonth(date: Date): Date {
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0, 23, 59, 59, 999)
  );
}

/** Strictly after the given date, so a Monday maps to the following Monday. */
export function nextUtcMonday(date: Date): Date {
  const day = startOfUtcDay(date);
  const daysAhead = (8 - day.getUTCDay()) % 7 || 7;
  return addUtcDays(day, daysAhead);
}

/** Reads a `<input type="date">` value as a UTC calendar day. */
export function parseUtcDateInput(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return new Date(NaN);
  return new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );
}

/** Formats for `<input type="date">` without shifting across a day boundary. */
export function formatUtcDateInput(date: Date): string {
  return startOfUtcDay(date).toISOString().slice(0, 10);
}

/**
 * Payout dates must read the same for every admin, so they are always rendered
 * in UTC rather than the viewer's local zone.
 */
export function formatUtcDate(
  date: Date,
  options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" }
): string {
  return date.toLocaleDateString("en-US", { ...options, timeZone: "UTC" });
}
