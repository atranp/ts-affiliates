"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

export type LedgerFilterOption<T extends string> = {
  value: T;
  label: string;
  count?: number;
};

type LedgerFilterSelectProps<T extends string> = {
  /** Visible label above the control — omit when the selected value is self-explanatory */
  label?: string;
  /** Used for id + screen readers when `label` is omitted */
  ariaLabel?: string;
  value: T;
  options: LedgerFilterOption<T>[];
  onChange: (value: T) => void;
  className?: string;
};

function formatOptionLabel(label: string, count?: number) {
  if (count === undefined) return label;
  return `${label} · ${count.toLocaleString()}`;
}

export function LedgerFilterSelect<T extends string>({
  label,
  ariaLabel,
  value,
  options,
  onChange,
  className,
}: LedgerFilterSelectProps<T>) {
  const accessibleName = label ?? ariaLabel ?? "Filter";
  const id = `ledger-filter-${accessibleName.toLowerCase().replace(/\s+/g, "-")}`;

  return (
    <div className={cn("ts-filter-select", className)}>
      {label ? (
        <label htmlFor={id} className="ts-filter-select-label">
          {label}
        </label>
      ) : null}
      <div className="ts-filter-select-control">
        <select
          id={id}
          value={value}
          onChange={(event) => onChange(event.target.value as T)}
          className="ts-filter-select-field"
          aria-label={label ? undefined : accessibleName}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {formatOptionLabel(option.label, option.count)}
            </option>
          ))}
        </select>
        <ChevronDown className="ts-filter-select-icon" aria-hidden />
      </div>
    </div>
  );
}
