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

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  // Payout weeks are stored in UTC, so render them in UTC rather than letting
  // the viewer's timezone shift the date by a day.
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

export function LedgerTable({
  entries,
  showDetails = false,
  affiliateView = false,
}: {
  entries: LedgerEntry[];
  showDetails?: boolean;
  affiliateView?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <p className="py-8 text-center text-sm text-muted-foreground">
        {affiliateView ? AFFILIATE_COPY.commissions.empty : "No entries yet."}
      </p>
    );
  }

  const cols = affiliateView ? AFFILIATE_COPY.commissions.columns : null;

  const cards = (
    <DataCardList>
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
              <Badge variant={statusVariant(status)}>
                {formatCommissionStatus(status)}
              </Badge>
              <span>{formatCommissionType(entry.type)}</span>
              {entry.wooOrderId && !details.includes(`#${entry.wooOrderId}`) && (
                <span>Order #{entry.wooOrderId}</span>
              )}
              {showDetails && entry.payoutWeek && (
                <span>
                  {cols?.payout ?? "Payout week"}:{" "}
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
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="ts-table-header hover:bg-muted">
            <TableHead>{cols?.date ?? "Date"}</TableHead>
            <TableHead>{cols?.type ?? "Type"}</TableHead>
            {showDetails && (
              <TableHead>{cols?.details ?? "Details"}</TableHead>
            )}
            {!showDetails && <TableHead>Source</TableHead>}
            {/* The affiliate view folds the order number into Details. */}
            {!affiliateView && <TableHead>Order</TableHead>}
            <TableHead className="text-right">{cols?.sale ?? "Sale"}</TableHead>
            <TableHead className="text-right">
              {cols?.amount ?? "Amount"}
            </TableHead>
            {showDetails && (
              <TableHead>{cols?.payout ?? "Payout week"}</TableHead>
            )}
            <TableHead>{cols?.status ?? "Status"}</TableHead>
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
              className="text-xs hover:bg-muted/80"
            >
              <TableCell className="whitespace-nowrap font-medium">
                {formatSaleDate(entry.occurredAt)}
              </TableCell>
              <TableCell>
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
                <TableCell className="max-w-xs font-semibold text-brand-dark">
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
                <TableCell>
                  {entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              )}
              {!affiliateView && (
                <TableCell className="font-mono font-medium text-muted-foreground">
                  {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-muted-foreground">
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "whitespace-nowrap text-right text-sm font-bold tabular-nums",
                  affiliateView ? amountClass(status) : "text-emerald-700"
                )}
              >
                {formatCurrency(entry.amount)}
              </TableCell>
              {showDetails && (
                <TableCell className="text-muted-foreground">
                  {formatPayoutWeek(entry.payoutWeek)}
                </TableCell>
              )}
              <TableCell>
                <Badge variant={statusVariant(status)}>
                  {formatCommissionStatus(status)}
                </Badge>
              </TableCell>
            </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );

  return <ResponsiveTable table={table} cards={cards} />;
}
