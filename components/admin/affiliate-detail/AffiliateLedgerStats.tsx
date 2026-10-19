"use client";

import { StatCard } from "@/components/admin/StatCard";
import type { LedgerTab } from "@/hooks/use-ledger";
import type { AdminAffiliateDetail } from "@/lib/admin/types";
import { formatCurrency } from "@/lib/utils";

type StatTile = {
  tab: LedgerTab;
  label: string;
  value: number;
  hint: string;
  variant?: "primary" | "success" | "warning";
  hoverClass: string;
};

export function AffiliateLedgerStats({
  summary,
  onSelect,
}: {
  summary: AdminAffiliateDetail["ledger"];
  onSelect: (tab: LedgerTab) => void;
}) {
  const tiles: StatTile[] = [
    {
      tab: "unpaid",
      label: "Unpaid",
      value: summary.unpaidTotal,
      hint: `${summary.unpaidCount} entries`,
      variant: "primary",
      hoverClass: "hover:border-primary/50",
    },
    {
      tab: "paid",
      label: "Paid",
      value: summary.paidTotal,
      hint: `${summary.paidCount} entries`,
      variant: "success",
      hoverClass: "hover:border-success/50",
    },
    {
      tab: "pending",
      label: "Pending",
      value: summary.pendingTotal,
      hint: "Milestone-gated",
      variant: "warning",
      hoverClass: "hover:border-warning/50",
    },
    {
      tab: "overrides",
      label: "Overrides",
      value: summary.overrideTotal,
      hint: `${summary.overrideCount} bonuses`,
      hoverClass: "hover:border-border",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:gap-4 xl:grid-cols-4">
      {tiles.map((tile) => (
        <button
          key={tile.tab}
          type="button"
          className="text-left"
          onClick={() => onSelect(tile.tab)}
        >
          <StatCard
            label={tile.label}
            value={formatCurrency(tile.value)}
            hint={tile.hint}
            variant={tile.variant}
            className={`${tile.hoverClass} transition-colors cursor-pointer h-full`}
          />
        </button>
      ))}
    </div>
  );
}
