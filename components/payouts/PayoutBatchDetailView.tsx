"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
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
import { isPayoutPaid, payoutStatusLabel } from "@/lib/payouts/status";
import type { PayoutBatchDetail } from "@/lib/payouts/types";
import { formatCurrency } from "@/lib/utils";

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

/** Rounded to one decimal so a 10% rule reads as "10%", not "9.9987%". */
function formatRate(amount: number, revenue: number) {
  if (!revenue) return "—";
  const rate = (amount / revenue) * 100;
  return `${rate.toFixed(1).replace(/\.0$/, "")}%`;
}

function entryDetails(entry: PayoutBatchDetail["entries"][number]) {
  return (
    entry.description ??
    entry.sourceAffiliate?.displayName ??
    entry.sourceAffiliate?.email ??
    entry.dealRule?.name ??
    "—"
  );
}

type PayoutBatchDetailViewProps = {
  batch: PayoutBatchDetail;
  adminView?: boolean;
  backHref?: string;
  backLabel?: string;
  /** Admin-only controls; omitted for the affiliate's read-only view. */
  actions?: React.ReactNode;
};

export function PayoutBatchDetailView({
  batch,
  adminView = false,
  backHref,
  backLabel = "Back",
  actions,
}: PayoutBatchDetailViewProps) {
  const paid = isPayoutPaid(batch.status);
  const timing = paid
    ? `Paid ${formatDate(batch.processedAt ?? batch.createdAt)}`
    : `Created ${formatDate(batch.createdAt)} · payment not sent yet`;

  return (
    <div className="space-y-6">
      {backHref && (
        <Link
          href={backHref}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ChevronRight className="h-4 w-4 rotate-180" />
          {backLabel}
        </Link>
      )}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="page-title">{batch.label}</h1>
          <p className="page-description">
            {batch.teamName ? `${batch.teamName} · ` : ""}
            {timing}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={paid ? "paid" : "pending"}>
            {payoutStatusLabel(batch.status)}
          </Badge>
          {actions}
        </div>
      </div>

      {!paid && (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          This payout is a record of what&apos;s owed. Mark it as paid once the
          money has actually been sent.
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">
            {paid ? "Total paid" : "Total owed"}
          </p>
          <p className="mt-1 text-2xl font-semibold">
            {formatCurrency(batch.totals.grandTotal)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Direct commissions</p>
          <p className="mt-1 text-2xl font-semibold">
            {formatCurrency(batch.totals.directTotal)}
          </p>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">Team bonuses</p>
          <p className="mt-1 text-2xl font-semibold text-primary">
            {formatCurrency(batch.totals.overrideTotal)}
          </p>
        </div>
      </div>

      {batch.recruitBreakdown.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">By recruit</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {batch.recruitBreakdown.map((recruit) => (
              <div
                key={recruit.sourceAffiliateId}
                className="flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="font-medium truncate">
                    {recruit.displayName ?? recruit.email}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {recruit.overrideCount}{" "}
                    {recruit.overrideCount === 1 ? "sale" : "sales"} totalling{" "}
                    {formatCurrency(recruit.sourceRevenue)}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="font-semibold text-primary">
                    {formatCurrency(recruit.overrideTotal)}
                  </p>
                  {recruit.sourceRevenue > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {formatRate(recruit.overrideTotal, recruit.sourceRevenue)}{" "}
                      of sales
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-sm font-medium">
          Line items ({batch.totals.entryCount})
        </h2>
        <ResponsiveTable
          table={
            <div className="overflow-x-auto rounded-lg border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Sale amount</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">You earned</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batch.entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                        {formatDate(entry.occurredAt)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant={
                            entry.type === "OVERRIDE" ? "unpaid" : "secondary"
                          }
                          className="text-xs"
                        >
                          {entry.type === "OVERRIDE" ? "Bonus" : "Direct"}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entryDetails(entry)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                        {entry.orderRevenue == null
                          ? "—"
                          : formatCurrency(entry.orderRevenue)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                        {entry.orderRevenue
                          ? formatRate(entry.amount, entry.orderRevenue)
                          : "—"}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right font-medium tabular-nums text-success">
                        {formatCurrency(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          cards={
            <DataCardList>
              {batch.entries.map((entry) => (
                <DataCard key={entry.id}>
                  <DataCardHeader
                    title={entryDetails(entry)}
                    subtitle={formatDate(entry.occurredAt)}
                    value={
                      <span className="text-success">
                        {formatCurrency(entry.amount)}
                      </span>
                    }
                    valueHint={
                      entry.orderRevenue
                        ? `${formatRate(entry.amount, entry.orderRevenue)} of ${formatCurrency(entry.orderRevenue)}`
                        : undefined
                    }
                  />
                  <DataCardMeta>
                    <Badge
                      variant={
                        entry.type === "OVERRIDE" ? "unpaid" : "secondary"
                      }
                      className="text-xs"
                    >
                      {entry.type === "OVERRIDE" ? "Bonus" : "Direct"}
                    </Badge>
                    {entry.wooOrderId && <span>Order #{entry.wooOrderId}</span>}
                  </DataCardMeta>
                </DataCard>
              ))}
            </DataCardList>
          }
        />
        <p className="text-xs text-muted-foreground">
          Rate is your earnings divided by the sale amount, so you can check
          every line against your agreement.
        </p>
      </section>

      {adminView && batch.items.length > 1 && (
        <section className="space-y-3">
          <h2 className="text-sm font-medium">Affiliates in batch</h2>
          <ResponsiveTable
            table={
              <div className="overflow-hidden rounded-lg border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Affiliate</TableHead>
                      <TableHead className="text-right">Direct</TableHead>
                      <TableHead className="text-right">Bonuses</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batch.items.map((item) => (
                      <TableRow key={item.affiliateId}>
                        <TableCell>{item.displayName ?? item.email}</TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums">
                          {formatCurrency(item.directTotal)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right tabular-nums text-primary">
                          {formatCurrency(item.overrideTotal)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {formatCurrency(item.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            cards={
              <DataCardList>
                {batch.items.map((item) => (
                  <DataCard key={item.affiliateId}>
                    <DataCardHeader
                      title={item.displayName ?? item.email}
                      value={formatCurrency(item.totalAmount)}
                    />
                    <DataCardMeta>
                      <span>Direct {formatCurrency(item.directTotal)}</span>
                      <span>Bonuses {formatCurrency(item.overrideTotal)}</span>
                    </DataCardMeta>
                  </DataCard>
                ))}
              </DataCardList>
            }
          />
        </section>
      )}
    </div>
  );
}
