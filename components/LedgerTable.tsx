"use client";

import {
  formatCommissionStatus,
  formatCommissionType,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import { formatCurrency, cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
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
};

function statusVariant(
  status: string
): "paid" | "pending" | "unpaid" | "secondary" {
  if (status === "PAID") return "paid";
  if (status === "PENDING") return "pending";
  if (status === "UNPAID") return "unpaid";
  return "secondary";
}

function amountClass(status: string): string {
  if (status === "PAID") return "text-emerald-700";
  if (status === "PENDING") return "text-amber-700";
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

  return (
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
            <TableHead>{cols?.sale ?? "Sale"}</TableHead>
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
          {entries.map((entry) => (
            <TableRow
              key={entry.id}
              className="text-xs hover:bg-muted/80"
            >
              <TableCell className="whitespace-nowrap font-medium">
                {new Date(entry.occurredAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
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
              <TableCell className="font-medium text-muted-foreground">
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right text-sm font-bold tabular-nums",
                  affiliateView
                    ? amountClass(entry.status)
                    : "text-emerald-700"
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
                <Badge variant={statusVariant(entry.status)}>
                  {affiliateView
                    ? formatCommissionStatus(entry.status)
                    : entry.status}
                </Badge>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
