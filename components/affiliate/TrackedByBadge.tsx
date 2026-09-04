import { Link2, Link2Off, UserRound } from "lucide-react";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { cn } from "@/lib/utils";

/**
 * Whether a sale can be traced back to a click on this affiliate's link.
 *
 * Renders nothing when the answer is null, which is how team earnings arrive —
 * the sale was someone else's, so neither answer would be about the reader.
 */
export function TrackedByBadge({
  tracked,
  isLifetimeSale = false,
  className,
}: {
  tracked: boolean | null | undefined;
  isLifetimeSale?: boolean;
  className?: string;
}) {
  if (tracked === null || tracked === undefined) return null;

  if (isLifetimeSale) {
    const copy = AFFILIATE_COPY.commissions.tracked;
    return (
      <span
        title={copy.linkedCustomerHint}
      className={cn(
          "ts-affiliate-badge ts-affiliate-badge-lifetime inline-flex h-6 max-w-full items-center gap-1 truncate px-2.5 text-[10px] font-medium leading-none",
          className
        )}
      >
        <UserRound className="h-3 w-3" aria-hidden />
        {copy.linkedCustomer}
      </span>
    );
  }

  const copy = AFFILIATE_COPY.commissions.tracked;
  const Icon = tracked ? Link2 : Link2Off;

  return (
    <span
      title={tracked ? copy.linkedHint : copy.unlinkedHint}
      className={cn(
        "inline-flex h-6 max-w-full items-center gap-1 truncate rounded-full px-2.5 text-[10px] font-medium leading-none",
        tracked
          ? "bg-primary/10 text-primary"
          : "bg-muted text-muted-foreground",
        className
      )}
    >
      <Icon className="h-3 w-3" aria-hidden />
      {tracked ? copy.linked : copy.unlinked}
    </span>
  );
}
