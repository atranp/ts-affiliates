import { Badge } from "@/components/ui/badge";
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
    <Badge
      variant="outline"
      className={cn(
        "h-5 shrink-0 rounded px-1.5 py-0 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground",
        className
      )}
      title="Recorded in SliceWP"
    >
      SliceWP
    </Badge>
  );
}
