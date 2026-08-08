/**
 * Business calendar for the affiliate platform — aligned with the WooCommerce
 * store timezone (WordPress Settings → General → Timezone).
 *
 * Override via APP_TIMEZONE if the store uses something other than Pacific.
 */
export const APP_TIMEZONE =
  process.env.APP_TIMEZONE ?? "America/Los_Angeles";

/** Short label for UI hints, e.g. "Pacific Time". */
export const APP_TIMEZONE_LABEL =
  process.env.APP_TIMEZONE_LABEL ?? "Pacific Time";

export function formatAppDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    year: "numeric",
  }
): string {
  return new Date(value).toLocaleDateString("en-US", {
    ...options,
    timeZone: APP_TIMEZONE,
  });
}

/**
 * Includes clock time. A payout cutoff is an instant rather than a calendar
 * day, so dropping the time would misrepresent what the receipt covers.
 */
export function formatAppDateTime(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }
): string {
  return new Date(value).toLocaleString("en-US", {
    ...options,
    timeZone: APP_TIMEZONE,
  });
}
