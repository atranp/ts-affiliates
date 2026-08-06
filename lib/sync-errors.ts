/**
 * Sync failures surface in the admin header, where a raw Prisma or Postgres
 * message is noise at best and alarming at worst. Map the ones we know about
 * to something an operator can act on, and keep the original for the tooltip.
 */
export function describeSyncError(raw: string | null | undefined): {
  message: string;
  detail: string | null;
} | null {
  if (!raw) return null;
  const detail = raw.trim();
  if (!detail) return null;

  const lowered = detail.toLowerCase();

  if (
    lowered.includes("on conflict do update") ||
    lowered.includes("21000") ||
    lowered.includes("duplicate constrained values")
  ) {
    return {
      message:
        "Last sync stopped early — the store returned the same record twice. Run “Sync now” to retry.",
      detail,
    };
  }

  if (
    lowered.includes("etimedout") ||
    lowered.includes("econnreset") ||
    lowered.includes("econnrefused") ||
    lowered.includes("fetch failed") ||
    lowered.includes("timeout")
  ) {
    return {
      message:
        "Last sync couldn’t reach the store. Check that the site is up, then run “Sync now”.",
      detail,
    };
  }

  if (
    lowered.includes("401") ||
    lowered.includes("403") ||
    lowered.includes("unauthorized") ||
    lowered.includes("forbidden")
  ) {
    return {
      message:
        "Last sync was rejected by the store. Re-check the API credentials in Settings.",
      detail,
    };
  }

  return {
    message: "Last sync failed. Run “Sync now” to retry.",
    detail,
  };
}
