"use client";

import {
  Clock,
  DollarSign,
  Layers,
  Users,
} from "lucide-react";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import type { PayoutAdminStats } from "@/lib/payouts/admin-stats";
import { cn, formatCurrency } from "@/lib/utils";

export type PayoutStatusFilter = "all" | "awaiting" | "paid";

type PayoutStatsCardsProps = {
  stats?: PayoutAdminStats;
  loading?: boolean;
  onFilter?: (filter: PayoutStatusFilter) => void;
  onShowOwed?: () => void;
};

export function PayoutStatsCards({
  stats,
  loading,
  onFilter,
  onShowOwed,
}: PayoutStatsCardsProps) {
  if (loading || !stats) {
    return (
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <StatCardSkeleton key={index} />
        ))}
      </div>
    );
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <ClickableStatCard
        label="Awaiting payment"
        value={formatCurrency(stats.awaitingPaymentTotal)}
        hint={`${stats.openBatchCount} open ${stats.openBatchCount === 1 ? "batch" : "batches"}`}
        variant="warning"
        icon={Clock}
        onClick={() => onFilter?.("awaiting")}
      />
      <ClickableStatCard
        label="Paid this month"
        value={formatCurrency(stats.paidThisMonthTotal)}
        variant="success"
        icon={DollarSign}
        onClick={() => onFilter?.("paid")}
      />
      <ClickableStatCard
        label="Affiliates with unpaid sales"
        value={stats.affiliatesWithUnpaidCount.toLocaleString("en-US")}
        hint={`${formatCurrency(stats.totalUnpaidLedger)} total unpaid`}
        variant="primary"
        icon={Users}
        onClick={onShowOwed}
      />
      <ClickableStatCard
        label="Open batches"
        value={stats.openBatchCount.toLocaleString("en-US")}
        variant="default"
        icon={Layers}
        onClick={() => onFilter?.("awaiting")}
      />
    </div>
  );
}

function ClickableStatCard({
  onClick,
  className,
  ...props
}: React.ComponentProps<typeof StatCard> & { onClick?: () => void }) {
  if (!onClick) {
    return <StatCard {...props} className={className} />;
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-xl text-left transition-shadow focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        "hover:shadow-sm active:scale-[0.995]",
        className
      )}
    >
      <StatCard {...props} />
    </button>
  );
}
