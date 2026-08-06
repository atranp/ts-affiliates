"use client";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { formatPeriodLabel } from "@/lib/payouts/dates";
import { APP_TIMEZONE_LABEL } from "@/lib/timezone";

type PayoutDateRangeFieldsProps = {
  startValue: string;
  endValue: string;
  onStartChange: (value: string) => void;
  onEndChange: (value: string) => void;
  disabled?: boolean;
  hint?: string;
};

export function PayoutDateRangeFields({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  disabled = false,
  hint,
}: PayoutDateRangeFieldsProps) {
  const startDate = startValue ? new Date(startValue) : null;
  const endDate = endValue ? new Date(endValue) : null;
  const invalidRange =
    startDate &&
    endDate &&
    !Number.isNaN(startDate.getTime()) &&
    !Number.isNaN(endDate.getTime()) &&
    startDate > endDate;

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="payout-start" className="ts-field-label">
            Start date
          </Label>
          <Input
            id="payout-start"
            type="date"
            value={startValue}
            max={endValue || undefined}
            onChange={(e) => onStartChange(e.target.value)}
            disabled={disabled}
            className="ts-input"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="payout-end" className="ts-field-label">
            End date
          </Label>
          <Input
            id="payout-end"
            type="date"
            value={endValue}
            min={startValue || undefined}
            onChange={(e) => onEndChange(e.target.value)}
            disabled={disabled}
            className="ts-input"
          />
        </div>
      </div>
      <p
        className={cn(
          "text-xs leading-relaxed",
          invalidRange ? "text-destructive" : "text-muted-foreground"
        )}
      >
        {invalidRange
          ? "Start date must be on or before end date."
          : hint ??
            (startDate &&
            endDate &&
            !Number.isNaN(startDate.getTime()) &&
            !Number.isNaN(endDate.getTime())
              ? `Sales made ${formatPeriodLabel(startDate, endDate)} (${APP_TIMEZONE_LABEL}).`
              : "Pick the sale date range to include in this payout.")}
      </p>
    </div>
  );
}
