"use client";

import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";

type SelectedAffiliateBannerProps = {
  displayName: string;
  unpaidTotal: number;
  onClear: () => void;
};

export function SelectedAffiliateBanner({
  displayName,
  unpaidTotal,
  onClear,
}: SelectedAffiliateBannerProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3">
      <p className="text-sm">
        <span className="text-muted-foreground">Paying:</span>{" "}
        <span className="font-semibold text-brand-dark">{displayName}</span>
        <span className="text-muted-foreground"> · </span>
        <span className="font-semibold tabular-nums text-primary">
          {formatCurrency(unpaidTotal)} owed
        </span>
      </p>
      <Button size="sm" variant="ghost" onClick={onClear}>
        <X className="mr-1.5 h-4 w-4" />
        Clear
      </Button>
    </div>
  );
}
