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
    <div className="ts-banner">
      <p className="text-sm leading-relaxed">
        <span className="font-medium text-muted-foreground">Paying</span>{" "}
        <span className="font-semibold text-brand-dark">{displayName}</span>
        <span className="mx-1.5 text-border">·</span>
        <span className="font-semibold tabular-nums text-primary">
          {formatCurrency(unpaidTotal)}
        </span>
        <span className="text-muted-foreground"> owed</span>
      </p>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 text-muted-foreground hover:text-foreground"
        onClick={onClear}
      >
        <X className="mr-1.5 h-3.5 w-3.5" />
        Clear
      </Button>
    </div>
  );
}
