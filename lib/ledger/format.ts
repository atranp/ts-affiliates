import { formatAppDate } from "@/lib/timezone";

/** Short weekday label for a ledger entry's scheduled payout week. */
export function formatPayoutWeekLabel(iso: string | null) {
  if (!iso) return "—";
  return formatAppDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
