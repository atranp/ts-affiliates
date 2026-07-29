import { Target } from "lucide-react";
import { formatCurrency } from "@/lib/utils";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

type MilestoneProgressProps = {
  current: number | string;
  threshold: number | string | null;
  remaining?: number | string | null;
  met?: boolean;
  compact?: boolean;
};

export function MilestoneProgress({
  current,
  threshold,
  remaining,
  met = false,
  compact = false,
}: MilestoneProgressProps) {
  if (!threshold) return null;

  const currentNum = Number(current);
  const thresholdNum = Number(threshold);
  const pct = met
    ? 100
    : Math.min(100, Math.round((currentNum / thresholdNum) * 100));

  if (met) {
    return (
      <p className="text-xs font-medium text-emerald-700">
        {AFFILIATE_COPY.team.goalReached}
      </p>
    );
  }

  return (
    <div
      className={
        compact
          ? "space-y-1 rounded-lg border border-border bg-muted/30 p-3"
          : "space-y-1.5 rounded-lg border border-border bg-card p-3"
      }
    >
      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-muted-foreground">
        <span className="flex items-center gap-1 text-brand-dark">
          <Target className="h-3.5 w-3.5 text-primary" />
          {AFFILIATE_COPY.team.salesGoal}
        </span>
        <span>
          <strong className="text-primary">{formatCurrency(currentNum)}</strong>{" "}
          / {formatCurrency(thresholdNum)}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-border">
        <div
          className="h-full rounded-full bg-primary transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {remaining != null && !compact && (
        <p className="text-xs text-muted-foreground">
          {formatCurrency(remaining)} to go
        </p>
      )}
    </div>
  );
}
