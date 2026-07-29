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
  createdAt: string;
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
  if (status === "PAID") return "text-success";
  if (status === "PENDING") return "text-warning";
  if (status === "UNPAID") return "text-primary";
  return "text-foreground";
}

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
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
      <p className="text-sm text-muted-foreground">
        {affiliateView ? AFFILIATE_COPY.commissions.empty : "No entries yet."}
      </p>
    );
  }

  const cols = affiliateView ? AFFILIATE_COPY.commissions.columns : null;

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <Table>
        <TableHeader>
          <TableRow className="bg-muted/40 hover:bg-muted/40">
            <TableHead>{cols?.date ?? "Date"}</TableHead>
            <TableHead>{cols?.type ?? "Type"}</TableHead>
            {showDetails && (
              <TableHead>{cols?.details ?? "Details"}</TableHead>
            )}
            {!showDetails && <TableHead>Source</TableHead>}
            <TableHead>{cols?.order ?? "Order"}</TableHead>
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
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {new Date(entry.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
              </TableCell>
              <TableCell>
                <Badge
                  variant={
                    entry.type === "OVERRIDE" ? "unpaid" : "secondary"
                  }
                  className="font-normal"
                >
                  {affiliateView
                    ? formatCommissionType(entry.type)
                    : entry.type === "OVERRIDE"
                      ? "Team bonus"
                      : entry.type}
                </Badge>
              </TableCell>
              {showDetails ? (
                <TableCell className="max-w-xs text-sm text-muted-foreground">
                  {entry.description ??
                    entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              ) : (
                <TableCell>
                  {entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              )}
              <TableCell className="text-muted-foreground">
                {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
              </TableCell>
              <TableCell className="text-muted-foreground">
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  "text-right font-medium tabular-nums",
                  affiliateView
                    ? amountClass(entry.status)
                    : "text-success"
                )}
              >
                {formatCurrency(entry.amount)}
              </TableCell>
              {showDetails && (
                <TableCell className="text-sm text-muted-foreground">
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
