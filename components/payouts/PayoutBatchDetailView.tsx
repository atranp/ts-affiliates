"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { WooOrderLink } from "@/components/admin/WooOrderLink";
import { PayoutSourceBadge } from "@/components/payouts/PayoutSourceBadge";
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
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";
import type { PayoutBatchDetail } from "@/lib/payouts/types";

function formatDate(iso: string) {
  return formatSaleDate(iso);
}

/** Rounded to one decimal so a 10% rule reads as "10%", not "9.9987%". */
function formatRate(amount: number, revenue: number) {
  if (!revenue) return "—";
  const rate = (amount / revenue) * 100;
  return `${rate.toFixed(1).replace(/\.0$/, "")}%`;
}

/** Anything that is neither a sale nor a team override is an adjustment. */
function entryBadge(type: string) {
  if (type === "DIRECT") return { label: "Direct", variant: "secondary" } as const;
  if (type === "OVERRIDE") return { label: "Bonus", variant: "unpaid" } as const;
  return { label: "Adjustment", variant: "outline" } as const;
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
  const recordedAt = formatDate(batch.processedAt ?? batch.createdAt);

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
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="page-title">{batch.label}</h1>
            <PayoutSourceBadge source={batch.source} />
          </div>
          <p className="page-description">
            {[
              batch.teamName,
              `Recorded ${recordedAt}`,
              batch.payoutMethod ? `Paid via ${batch.payoutMethod}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        {actions && (
          <div className="flex flex-wrap items-center gap-2">{actions}</div>
        )}
      </div>

      <div
        className={cn(
          "grid gap-3",
          batch.totals.otherTotal !== 0 ? "sm:grid-cols-4" : "sm:grid-cols-3"
        )}
      >
        <div className="ts-figure">
          <p className="ts-figure-label">Total</p>
          <p className="mt-1 stat-value text-brand-dark">
            {formatCurrency(batch.totals.grandTotal)}
          </p>
        </div>
        <div className="ts-figure">
          <p className="ts-figure-label">Direct commissions</p>
          <p className="mt-1 stat-value text-brand-dark">
            {formatCurrency(batch.totals.directTotal)}
          </p>
        </div>
        <div className="ts-figure ts-figure-highlight">
          <p className="ts-figure-label">Team bonuses</p>
          <p className="mt-1 stat-value text-primary">
            {formatCurrency(batch.totals.overrideTotal)}
          </p>
        </div>
        {batch.totals.otherTotal !== 0 && (
          <div className="ts-figure">
            <p className="ts-figure-label">Bonuses &amp; adjustments</p>
            <p className="mt-1 stat-value text-brand-dark">
              {formatCurrency(batch.totals.otherTotal)}
            </p>
          </div>
        )}
      </div>

      {batch.recruitBreakdown.length > 0 && (
        <section className="space-y-3">
          <h2 className="ts-section-title">By recruit</h2>
          <div className="grid gap-2 sm:grid-cols-2">
            {batch.recruitBreakdown.map((recruit) => (
              <div
                key={recruit.sourceAffiliateId}
                className="ts-list-row flex-row items-center justify-between gap-3 px-4 py-3"
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
        <h2 className="ts-section-title">
          Line items ({batch.totals.entryCount})
        </h2>
        <ResponsiveTable
          table={
            <div className="ts-table-wrap overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="ts-table-header hover:bg-muted">
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Order</TableHead>
                    <TableHead className="text-right">Sale amount</TableHead>
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
                          variant={entryBadge(entry.type).variant}
                          className="text-xs"
                        >
                          {entryBadge(entry.type).label}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        {entryDetails(entry)}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-sm tabular-nums">
                        {entry.wooOrderId ? (
                          adminView ? (
                            <WooOrderLink orderId={entry.wooOrderId} />
                          ) : (
                            `#${entry.wooOrderId}`
                          )
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell className="whitespace-nowrap text-right text-sm tabular-nums">
                        {entry.orderRevenue == null
                          ? "—"
                          : formatCurrency(entry.orderRevenue)}
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
                        ? `${formatCurrency(entry.orderRevenue)} sale`
                        : undefined
                    }
                  />
                  <DataCardMeta>
                    <Badge
                      variant={entryBadge(entry.type).variant}
                      className="text-xs"
                    >
                      {entryBadge(entry.type).label}
                    </Badge>
                    {entry.wooOrderId &&
                      !entryDetails(entry).includes(`#${entry.wooOrderId}`) &&
                      (adminView ? (
                        <WooOrderLink
                          orderId={entry.wooOrderId}
                          className="text-xs"
                        />
                      ) : (
                        <span>Order #{entry.wooOrderId}</span>
                      ))}
                  </DataCardMeta>
                </DataCard>
              ))}
            </DataCardList>
          }
        />
      </section>

      {adminView && batch.items.length > 1 && (
        <section className="space-y-3">
          <h2 className="ts-section-title">Affiliates in batch</h2>
          <ResponsiveTable
            table={
              <div className="ts-table-wrap overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow className="ts-table-header hover:bg-muted">
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
