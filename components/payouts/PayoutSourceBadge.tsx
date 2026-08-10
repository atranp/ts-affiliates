import { affiliateBadgeClass } from "@/components/affiliate/AffiliateBadge";
import { cn } from "@/lib/utils";
import type { PayoutSource } from "@/lib/payouts/types";

/**
 * Payouts recorded here are the norm, so only the imported ones are marked.
 */
export function PayoutSourceBadge({
  source,
  className,
}: {
  source: PayoutSource | undefined;
  className?: string;
}) {
  if (source !== "SLICEWP") return null;

  return (
    <span
      className={cn(affiliateBadgeClass("neutral"), className)}
      title="Recorded in SliceWP"
    >
      SliceWP
    </span>
  );
}
