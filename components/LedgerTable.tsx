"use client";

import { formatCurrency } from "@/lib/utils";
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
};

function statusVariant(
  status: string
): "paid" | "pending" | "unpaid" | "secondary" {
  if (status === "PAID") return "paid";
  if (status === "PENDING") return "pending";
  if (status === "UNPAID") return "unpaid";
  return "secondary";
}

export function LedgerTable({ entries }: { entries: LedgerEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-sm text-muted-foreground">No entries yet.</p>;
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Date</TableHead>
          <TableHead>Type</TableHead>
          <TableHead>Source</TableHead>
          <TableHead>Order</TableHead>
          <TableHead>Sale</TableHead>
          <TableHead>Amount</TableHead>
          <TableHead>Status</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => (
          <TableRow key={entry.id}>
            <TableCell>
              {new Date(entry.createdAt).toLocaleDateString("en-US")}
            </TableCell>
            <TableCell>{entry.type}</TableCell>
            <TableCell>
              {entry.sourceAffiliate?.displayName ??
                entry.sourceAffiliate?.email ??
                "—"}
            </TableCell>
            <TableCell>
              {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
            </TableCell>
            <TableCell>
              {entry.orderRevenue
                ? formatCurrency(entry.orderRevenue)
                : "—"}
            </TableCell>
            <TableCell className="font-medium text-success">
              {formatCurrency(entry.amount)}
            </TableCell>
            <TableCell>
              <Badge variant={statusVariant(entry.status)}>{entry.status}</Badge>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
