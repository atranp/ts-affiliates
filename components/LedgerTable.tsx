"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { CommissionRow, commissionAmountTone } from "@/components/affiliate/CommissionRow";
import { CommissionTypeBadge } from "@/components/affiliate/AffiliateBadge";
import {
  formatCommissionStatus,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import {
  AWAITING_PAYMENT,
  effectiveLedgerStatus,
} from "@/lib/payouts/status";
import { formatAppDate } from "@/lib/timezone";
import { formatCurrency, formatSaleDate, cn } from "@/lib/utils";
import type { LedgerSortKey, SortDirection } from "@/lib/ledger/sort";
import { Badge } from "@/components/ui/badge";
import {
  DataCard,
  DataCardHeader,
  DataCardList,
  DataCardMeta,
  ResponsiveTable,
} from "@/components/ui/data-cards";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

type LedgerEntry = {
  id: string;
  type: string;
  amount: string | number;
  status: string;
  description: string | null;
  wooOrderId: number | null;
  orderRevenue: string | number | null;
  payoutWeek: string | null;
  paidAt: string | null;
  occurredAt: string;
  sourceAffiliate?: {
    displayName: string | null;
    email: string;
  } | null;
  dealRule?: { id: string; name: string } | null;
  payoutBatch?: { id: string; label: string; status: string } | null;
};

function statusVariant(
  status: string
): "paid" | "pending" | "unpaid" | "secondary" {
  if (status === "PAID") return "paid";
  if (status === "PENDING" || status === AWAITING_PAYMENT) return "pending";
  if (status === "UNPAID") return "unpaid";
  return "secondary";
}

function amountClass(status: string): string {
  const tone = commissionAmountTone(status);
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "primary") return "text-primary";
  return "text-brand-dark";
}

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return formatAppDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function SortableHead({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: LedgerSortKey;
  activeKey: LedgerSortKey;
  direction: SortDirection;
  onSort: (key: LedgerSortKey) => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const active = activeKey === sortKey;

  return (
    <TableHead
      className={cn(className, align === "right" && "text-right")}
      aria-sort={
        active
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-brand-dark",
          align === "right" && "flex-row-reverse",
          active ? "text-brand-dark" : "text-muted-foreground"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary" />
          ))}
      </button>
    </TableHead>
  );
}

export function LedgerTable({
  entries,
  showDetails = false,
  affiliateView = false,
  fillHeight = false,
  sortKey,
  sortDir,
  onSort,
}: {
  entries: LedgerEntry[];
  showDetails?: boolean;
  affiliateView?: boolean;
  fillHeight?: boolean;
  sortKey?: LedgerSortKey;
  sortDir?: SortDirection;
  onSort?: (key: LedgerSortKey) => void;
}) {
  if (entries.length === 0) {
    return (
      <p
        className={cn(
          "ts-empty-inline py-8",
          fillHeight && "flex min-h-0 flex-1 items-center justify-center"
        )}
      >
        {affiliateView ? AFFILIATE_COPY.commissions.empty : "No entries yet."}
      </p>
    );
  }

  const cols = affiliateView ? AFFILIATE_COPY.commissions.columns : null;
  const sortable = affiliateView && !!onSort && !!sortKey && !!sortDir;
  const thClass =
    "ts-table-header sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm";

  const renderHead = (
    key: LedgerSortKey,
    label: string,
    align: "left" | "right" = "left",
    extraClass?: string
  ) => {
    const className = cn(thClass, extraClass);

    if (sortable) {
      return (
        <SortableHead
          key={key}
          sortKey={key}
          activeKey={sortKey!}
          direction={sortDir!}
          onSort={onSort!}
          align={align}
          className={className}
        >
          {label}
        </SortableHead>
      );
    }

    return (
      <TableHead key={key} className={className}>
        {label}
      </TableHead>
    );
  };

  const cards = affiliateView ? (
    <div
      className={cn(
        "ts-table-body flex flex-col gap-2 md:hidden",
        fillHeight && "min-h-0"
      )}
    >
      {entries.map((entry) => {
        const status = effectiveLedgerStatus(entry.status, entry.payoutBatch);
        const details =
          entry.description ??
          entry.sourceAffiliate?.displayName ??
          entry.sourceAffiliate?.email ??
          "—";

        return (
          <CommissionRow
            key={entry.id}
            details={details}
            occurredAt={entry.occurredAt}
            orderRevenue={entry.orderRevenue}
            amount={formatCurrency(entry.amount)}
            status={status}
            type={entry.type}
            payoutWeek={entry.payoutWeek}
          />
        );
      })}
    </div>
  ) : (
    <DataCardList className={fillHeight ? "p-3 md:hidden" : "md:hidden"}>
      {entries.map((entry) => {
        const status = effectiveLedgerStatus(entry.status, entry.payoutBatch);
        const details =
          entry.description ??
          entry.sourceAffiliate?.displayName ??
          entry.sourceAffiliate?.email ??
          "—";
        return (
          <DataCard key={entry.id}>
            <DataCardHeader
              title={details}
              subtitle={formatSaleDate(entry.occurredAt)}
              value={<span>{formatCurrency(entry.amount)}</span>}
              valueHint={
                entry.orderRevenue
                  ? `of ${formatCurrency(entry.orderRevenue)}`
                  : undefined
              }
            />
            <DataCardMeta>
              <Badge variant={statusVariant(status)}>
                {formatCommissionStatus(status)}
              </Badge>
              <span>{entry.type === "OVERRIDE" ? "Team bonus" : entry.type}</span>
              {entry.wooOrderId && !details.includes(`#${entry.wooOrderId}`) && (
                <span>Order #{entry.wooOrderId}</span>
              )}
            </DataCardMeta>
          </DataCard>
        );
      })}
    </DataCardList>
  );

  const table = (
    <Table
      containerClassName={cn(
        affiliateView && fillHeight && "ts-table-body-scroll"
      )}
    >
      <TableHeader>
        <TableRow className="border-border/80 hover:bg-transparent">
          {renderHead("date", cols?.date ?? "Date", "left", "first:pl-5")}
          {renderHead("type", cols?.type ?? "Type")}
          {showDetails &&
            renderHead("details", cols?.details ?? "Details")}
          {!showDetails && <TableHead className={thClass}>Source</TableHead>}
          {!affiliateView && <TableHead className={thClass}>Order</TableHead>}
          {renderHead("sale", cols?.sale ?? "Sale", "right")}
          {renderHead(
            "amount",
            cols?.amount ?? "Amount",
            "right",
            "last:pr-5"
          )}
          {showDetails && !affiliateView && (
            <TableHead className={thClass}>
              {cols?.payout ?? "Payout week"}
            </TableHead>
          )}
          {renderHead("status", cols?.status ?? "Status", "left", "last:pr-5")}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const status = effectiveLedgerStatus(
            entry.status,
            entry.payoutBatch
          );
          return (
            <TableRow
              key={entry.id}
              className={cn(affiliateView && "border-border/60 hover:bg-card")}
            >
              <TableCell className="ts-row-meta whitespace-nowrap px-4 first:pl-5">
                {formatSaleDate(entry.occurredAt)}
              </TableCell>
              <TableCell className="px-4">
                {affiliateView ? (
                  <CommissionTypeBadge type={entry.type} />
                ) : (
                  <Badge
                    variant={
                      entry.type === "OVERRIDE" ? "unpaid" : "secondary"
                    }
                  >
                    {entry.type === "OVERRIDE" ? "Team bonus" : entry.type}
                  </Badge>
                )}
              </TableCell>
              {showDetails ? (
                <TableCell className="max-w-sm px-4">
                  <p className="ts-row-title">
                    {entry.description ??
                      entry.sourceAffiliate?.displayName ??
                      entry.sourceAffiliate?.email ??
                      "—"}
                  </p>
                  {entry.sourceAffiliate && !affiliateView && (
                    <p className="ts-row-meta mt-0.5">
                      Source:{" "}
                      {entry.sourceAffiliate.displayName ??
                        entry.sourceAffiliate.email}
                    </p>
                  )}
                </TableCell>
              ) : (
                <TableCell className="ts-row-title px-4">
                  {entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              )}
              {!affiliateView && (
                <TableCell className="ts-row-meta px-4 font-mono">
                  {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                </TableCell>
              )}
              <TableCell className="ts-row-meta whitespace-nowrap px-4 text-right tabular-nums">
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "ts-amount whitespace-nowrap px-4 text-right last:pr-5",
                  affiliateView ? amountClass(status) : "text-emerald-700"
                )}
              >
                {formatCurrency(entry.amount)}
              </TableCell>
              {showDetails && !affiliateView && (
                <TableCell className="ts-row-meta px-4">
                  {formatPayoutWeek(entry.payoutWeek)}
                </TableCell>
              )}
              <TableCell className="px-4 last:pr-5">
                {affiliateView ? (
                  <span className="ts-row-meta inline-flex flex-wrap items-baseline gap-x-1.5 font-medium">
                    {formatCommissionStatus(status)}
                    {status === "PAID" && entry.payoutWeek && (
                      <>
                        <span className="text-muted-foreground/50">·</span>
                        <span className="font-normal">
                          {formatPayoutWeek(entry.payoutWeek)}
                        </span>
                      </>
                    )}
                  </span>
                ) : (
                  <Badge variant={statusVariant(status)}>
                    {formatCommissionStatus(status)}
                  </Badge>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (affiliateView && fillHeight) {
    return (
      <>
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden ts-table-body md:flex">
          {table}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:hidden">
          {cards}
        </div>
      </>
    );
  }

  return <ResponsiveTable table={table} cards={cards} />;
}
