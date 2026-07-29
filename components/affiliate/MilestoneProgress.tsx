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
      <p className="text-xs font-medium text-success">
        {AFFILIATE_COPY.team.goalReached}
      </p>
    );
  }

  return (
    <div className={compact ? "space-y-1" : "space-y-1.5"}>
      <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>{AFFILIATE_COPY.team.salesGoal}</span>
        <span>
          {formatCurrency(currentNum)} / {formatCurrency(thresholdNum)}
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
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
