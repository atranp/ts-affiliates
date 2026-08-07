"use client";

import {
  formatCommissionStatus,
  formatCommissionType,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import {
  AWAITING_PAYMENT,
  effectiveLedgerStatus,
} from "@/lib/payouts/status";
import { formatAppDate } from "@/lib/timezone";
import { formatCurrency, formatSaleDate, cn } from "@/lib/utils";
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
  if (status === "PAID") return "text-emerald-700";
  if (status === "PENDING" || status === AWAITING_PAYMENT)
    return "text-amber-700";
  if (status === "UNPAID") return "text-primary";
  return "text-foreground";
}

function rowClass(entry: LedgerEntry, status: string, affiliateView: boolean) {
  if (!affiliateView) return undefined;

  if (entry.type === "OVERRIDE") {
    return "bg-purple-50/50 hover:bg-purple-50/70";
  }

  if (status === "UNPAID") {
    return "bg-primary-soft/20 hover:bg-primary-soft/30";
  }

  return undefined;
}

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return formatAppDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function AffiliateStatusBadge({ status }: { status: string }) {
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

  return <Badge variant="secondary">{label}</Badge>;
}

export function LedgerTable({
  entries,
  showDetails = false,
  affiliateView = false,
  fillHeight = false,
}: {
  entries: LedgerEntry[];
  showDetails?: boolean;
  affiliateView?: boolean;
  fillHeight?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p
        className={cn(
          "py-8 text-center text-sm text-muted-foreground",
          fillHeight && "flex min-h-0 flex-1 items-center justify-center"
        )}
      >
        {affiliateView ? AFFILIATE_COPY.commissions.empty : "No entries yet."}
      </p>
    );
  }

  const cols = affiliateView ? AFFILIATE_COPY.commissions.columns : null;

  const cards = (
    <DataCardList className={fillHeight ? "p-3 md:hidden" : "md:hidden"}>
      {entries.map((entry) => {
        const status = effectiveLedgerStatus(entry.status, entry.payoutBatch);
        const details =
          entry.description ??
          entry.sourceAffiliate?.displayName ??
          entry.sourceAffiliate?.email ??
          "—";
        return (
          <DataCard
            key={entry.id}
            className={cn(
              affiliateView && entry.type === "OVERRIDE" && "border-purple-200/80 bg-purple-50/40"
            )}
          >
            <DataCardHeader
              title={details}
              subtitle={formatSaleDate(entry.occurredAt)}
              value={
                <span className={affiliateView ? amountClass(status) : undefined}>
                  {formatCurrency(entry.amount)}
                </span>
              }
              valueHint={
                entry.orderRevenue
                  ? `of ${formatCurrency(entry.orderRevenue)}`
                  : undefined
              }
            />
            <DataCardMeta>
              {affiliateView ? (
                <AffiliateStatusBadge status={status} />
              ) : (
                <Badge variant={statusVariant(status)}>
                  {formatCommissionStatus(status)}
                </Badge>
              )}
              <span
                className={
                  affiliateView
                    ? entry.type === "OVERRIDE"
                      ? "ts-type-team"
                      : "ts-type-direct"
                    : undefined
                }
              >
                {formatCommissionType(entry.type)}
              </span>
              {entry.wooOrderId && !details.includes(`#${entry.wooOrderId}`) && (
                <span>Order #{entry.wooOrderId}</span>
              )}
              {affiliateView && status === "PAID" && entry.payoutWeek && (
                <span>
                  {cols?.payout ?? "Payout date"}:{" "}
                  {formatPayoutWeek(entry.payoutWeek)}
                </span>
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
        affiliateView && fillHeight && "ts-table-body-scroll min-h-0 flex-1"
      )}
    >
      <TableHeader>
        <TableRow className="border-border/80 hover:bg-transparent">
          <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm first:pl-5">
            {cols?.date ?? "Date"}
          </TableHead>
          <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm">
            {cols?.type ?? "Type"}
          </TableHead>
          {showDetails && (
            <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm">
              {cols?.details ?? "Details"}
            </TableHead>
          )}
          {!showDetails && (
            <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm">
              Source
            </TableHead>
          )}
          {!affiliateView && (
            <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm">
              Order
            </TableHead>
          )}
          <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 text-right backdrop-blur-sm">
            {cols?.sale ?? "Sale"}
          </TableHead>
          <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 text-right backdrop-blur-sm last:pr-5">
            {cols?.amount ?? "Amount"}
          </TableHead>
          {showDetails && !affiliateView && (
            <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm">
              {cols?.payout ?? "Payout week"}
            </TableHead>
          )}
          <TableHead className="sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm last:pr-5">
            {cols?.status ?? "Status"}
          </TableHead>
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
              className={cn(
                "text-xs",
                affiliateView && "border-border/60",
                rowClass(entry, status, affiliateView)
              )}
            >
              <TableCell className="whitespace-nowrap px-4 font-medium first:pl-5">
                {formatSaleDate(entry.occurredAt)}
              </TableCell>
              <TableCell className="px-4">
                {affiliateView ? (
                  <span
                    className={
                      entry.type === "OVERRIDE"
                        ? "ts-type-team"
                        : "ts-type-direct"
                    }
                  >
                    {formatCommissionType(entry.type)}
                  </span>
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
                <TableCell className="max-w-sm px-4 font-medium text-brand-dark">
                  {entry.description ??
                    entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                  {entry.sourceAffiliate && !affiliateView && (
                    <div className="text-[11px] font-normal text-muted-foreground">
                      Source:{" "}
                      {entry.sourceAffiliate.displayName ??
                        entry.sourceAffiliate.email}
                    </div>
                  )}
                </TableCell>
              ) : (
                <TableCell className="px-4">
                  {entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              )}
              {!affiliateView && (
                <TableCell className="px-4 font-mono font-medium text-muted-foreground">
                  {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap px-4 text-right font-medium tabular-nums text-muted-foreground">
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "whitespace-nowrap px-4 text-right text-sm font-bold tabular-nums last:pr-5",
                  affiliateView ? amountClass(status) : "text-emerald-700"
                )}
              >
                {formatCurrency(entry.amount)}
              </TableCell>
              {showDetails && !affiliateView && (
                <TableCell className="px-4 text-muted-foreground">
                  {formatPayoutWeek(entry.payoutWeek)}
                </TableCell>
              )}
              <TableCell className="px-4 last:pr-5">
                {affiliateView ? (
                  <AffiliateStatusBadge status={status} />
                ) : (
                  <Badge variant={statusVariant(status)}>
                    {formatCommissionStatus(status)}
                  </Badge>
                )}
                {affiliateView && status === "PAID" && entry.payoutWeek && (
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {formatPayoutWeek(entry.payoutWeek)}
                  </p>
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
      <div className="flex min-h-0 flex-1 flex-col">
        <div className="hidden min-h-0 flex-1 flex-col md:flex">{table}</div>
        {cards}
      </div>
    );
  }

  return <ResponsiveTable table={table} cards={cards} />;
}
