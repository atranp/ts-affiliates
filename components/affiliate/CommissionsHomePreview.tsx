"use client";

import { Receipt } from "lucide-react";
import {
  formatCommissionStatus,
  formatCommissionType,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import {
  useLedger,
  type LedgerTypeFilter,
} from "@/hooks/use-ledger";
import {
  AWAITING_PAYMENT,
  effectiveLedgerStatus,
} from "@/lib/payouts/status";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";

const PREVIEW_LIMIT = 3;

type CommissionsHomePreviewProps = {
  enabled?: boolean;
  onViewCommissions: () => void;
  onViewType: (type: LedgerTypeFilter) => void;
};

function StatusBadge({ status }: { status: string }) {
  const label = formatCommissionStatus(status);

  if (status === "PAID") {
    return <span className="ts-status-paid">{label}</span>;
  }
  if (status === "UNPAID") {
    return <span className="ts-status-owed">{label}</span>;
  }
  if (status === "PENDING" || status === AWAITING_PAYMENT) {
    return <span className="ts-status-pending">{label}</span>;
  }

  return (
    <span className="rounded-md border border-border bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

function amountClass(status: string): string {
  if (status === "PAID") return "text-emerald-700";
  if (status === "PENDING" || status === AWAITING_PAYMENT)
    return "text-amber-700";
  if (status === "UNPAID") return "text-primary";
  return "text-foreground";
}

export function CommissionsHomePreview({
  enabled = true,
  onViewCommissions,
  onViewType,
}: CommissionsHomePreviewProps) {
  const { data, isLoading } = useLedger({
    limit: PREVIEW_LIMIT,
    page: 1,
    enabled,
  });

  if (isLoading) {
    return (
      <div className="h-28 animate-pulse rounded-xl border border-border bg-muted/30" />
    );
  }

  if (!data) return null;

  const { tabCounts, entries } = data;
  const hasDirect = tabCounts.direct > 0;
  const hasTeam = tabCounts.overrides > 0;

  return (
    <div className="w-full space-y-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5 font-medium text-brand-dark">
          <Receipt className="h-3.5 w-3.5 text-primary" aria-hidden />
          {tabCounts.all.toLocaleString()} total entries
        </span>
        {hasDirect && (
          <button
            type="button"
            onClick={() => onViewType("direct")}
            className="hover:text-foreground hover:underline"
          >
            {tabCounts.direct.toLocaleString()}{" "}
            {AFFILIATE_COPY.commissions.typeDirect.toLowerCase()}
          </button>
        )}
        {hasTeam && (
          <button
            type="button"
            onClick={() => onViewType("team")}
            className="hover:text-foreground hover:underline"
          >
            {tabCounts.overrides.toLocaleString()}{" "}
            {AFFILIATE_COPY.commissions.typeTeam.toLowerCase()}
          </button>
        )}
      </div>

      {entries.length > 0 ? (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            {AFFILIATE_COPY.home.recentCommissions}
          </p>
          <div className="max-h-[11rem] overflow-y-auto overscroll-contain rounded-xl border border-border/80">
            <ul className="divide-y divide-border/60">
              {entries.map((entry) => {
                const status = effectiveLedgerStatus(
                  entry.status,
                  entry.payoutBatch
                );
                const details =
                  entry.description ??
                  entry.sourceAffiliate?.displayName ??
                  entry.sourceAffiliate?.email ??
                  "—";

                return (
                  <li key={entry.id}>
                    <button
                      type="button"
                      onClick={onViewCommissions}
                      className={cn(
                        "flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                        entry.type === "OVERRIDE" && "bg-purple-50/15",
                        entry.type !== "OVERRIDE" &&
                          status === "UNPAID" &&
                          "bg-primary-soft/10"
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span
                            className={
                              entry.type === "OVERRIDE"
                                ? "ts-type-team"
                                : "ts-type-direct"
                            }
                          >
                            {formatCommissionType(entry.type)}
                          </span>
                          <StatusBadge status={status} />
                        </div>
                        <p className="mt-1 truncate text-sm font-medium text-brand-dark">
                          {details}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatSaleDate(entry.occurredAt)}
                          {entry.orderRevenue
                            ? ` · ${formatCurrency(entry.orderRevenue)} sale`
                            : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={cn(
                            "text-sm font-bold tabular-nums",
                            amountClass(status)
                          )}
                        >
                          {formatCurrency(entry.amount)}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {AFFILIATE_COPY.commissions.columns.amount}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          {AFFILIATE_COPY.commissions.empty}
        </p>
      )}
    </div>
  );
}
