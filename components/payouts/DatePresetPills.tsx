"use client";

import type { DatePreset } from "@/lib/payouts/dates";
import { cn } from "@/lib/utils";

const PRESETS: { value: DatePreset; label: string }[] = [
  { value: "this_week", label: "This week" },
  { value: "last_week", label: "Last week" },
  { value: "this_month", label: "This month" },
  { value: "all", label: "All time" },
];

export function DatePresetPills({
  value,
  onChange,
  className,
}: {
  value: DatePreset;
  onChange: (preset: DatePreset) => void;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {PRESETS.map((preset) => (
        <button
          key={preset.value}
          type="button"
          onClick={() => onChange(preset.value)}
          className={cn(
            "filter-pill",
            value === preset.value
              ? "filter-pill-active"
              : "filter-pill-inactive"
          )}
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}
