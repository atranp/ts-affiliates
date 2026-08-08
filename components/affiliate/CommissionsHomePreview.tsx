"use client";

import { Receipt } from "lucide-react";
import {
  AffiliateAmountCell,
  AffiliateEmptyState,
  AffiliateListPanel,
  AffiliateMetaLine,
  AffiliateMetaHighlight,
  AffiliateSectionLabel,
} from "@/components/affiliate/primitives";
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

function amountTone(
  status: string
): "primary" | "success" | "warning" | "default" {
  if (status === "PAID") return "success";
  if (status === "PENDING" || status === AWAITING_PAYMENT) return "warning";
  if (status === "UNPAID") return "primary";
  return "default";
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
    <div className="w-full space-y-4">
      <AffiliateMetaLine>
        <AffiliateMetaHighlight icon={Receipt}>
          {tabCounts.all.toLocaleString()} total entries
        </AffiliateMetaHighlight>
        {hasDirect && (
          <button
            type="button"
            onClick={() => onViewType("direct")}
            className="font-normal hover:text-foreground hover:underline"
          >
            {tabCounts.direct.toLocaleString()}{" "}
            {AFFILIATE_COPY.commissions.typeDirect.toLowerCase()}
          </button>
        )}
        {hasTeam && (
          <button
            type="button"
            onClick={() => onViewType("team")}
            className="font-normal hover:text-foreground hover:underline"
          >
            {tabCounts.overrides.toLocaleString()}{" "}
            {AFFILIATE_COPY.commissions.typeTeam.toLowerCase()}
          </button>
        )}
      </AffiliateMetaLine>

      {entries.length > 0 ? (
        <div>
          <AffiliateSectionLabel>
            {AFFILIATE_COPY.home.recentCommissions}
          </AffiliateSectionLabel>
          <AffiliateListPanel scroll>
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
                        "ts-list-row items-start gap-3 py-3",
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
                        <p className="mt-1 truncate text-sm font-semibold text-brand-dark">
                          {details}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {formatSaleDate(entry.occurredAt)}
                          {entry.orderRevenue
                            ? ` · ${formatCurrency(entry.orderRevenue)} sale`
                            : ""}
                        </p>
                      </div>
                      <AffiliateAmountCell
                        amount={formatCurrency(entry.amount)}
                        sublabel={formatCommissionStatus(status)}
                        tone={amountTone(status)}
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          </AffiliateListPanel>
        </div>
      ) : (
        <AffiliateEmptyState>
          {AFFILIATE_COPY.commissions.empty}
        </AffiliateEmptyState>
      )}
    </div>
  );
}
