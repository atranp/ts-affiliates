"use client";

import { useRouter } from "next/navigation";
import { PayoutSourceBadge } from "@/components/payouts/PayoutSourceBadge";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { formatAppDate } from "@/lib/timezone";
import { cn, formatCurrency } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const cols = AFFILIATE_COPY.home.payoutsColumns;

type PayoutsHomeTableProps = {
  batches: PayoutBatchListItem[];
  detailHrefPrefix: string;
};

function payoutDateLabel(
  batch: Pick<PayoutBatchListItem, "processedAt" | "createdAt">,
) {
  const dateIso = batch.processedAt ?? batch.createdAt;
  return formatAppDate(dateIso, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function entryCountLabel(count: number) {
  return `${count.toLocaleString()} ${
    count === 1 ? "commission" : "commissions"
  }`;
}

export function PayoutsHomeTableSkeleton() {
  const thClass =
    "ts-table-header h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] first:pl-4 sm:px-4 sm:first:pl-5";

  return (
    <Table className="table-fixed" containerClassName="min-w-0 overflow-x-hidden">
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className={cn(thClass, "w-[62%]")}>{cols.payout}</TableHead>
          <TableHead className={cn(thClass, "w-[38%] text-right last:pr-4 sm:last:pr-5")}>
            {cols.amount}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[0, 1, 2].map((i) => (
          <TableRow key={i} className="border-border/60 hover:bg-transparent">
            <TableCell className="px-3 py-2.5 first:pl-4 sm:px-4 sm:first:pl-5">
              <div className="space-y-1.5">
                <div className="h-4 w-4/5 max-w-[10rem] animate-pulse rounded bg-muted" />
                <div className="h-3 w-16 animate-pulse rounded bg-muted/80" />
                <div className="h-3 w-24 animate-pulse rounded bg-muted/80" />
              </div>
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right last:pr-4 sm:px-4 sm:last:pr-5">
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-muted" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function PayoutsHomeTable({
  batches,
  detailHrefPrefix,
}: PayoutsHomeTableProps) {
  const router = useRouter();
  const thClass =
    "ts-table-header h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] first:pl-4 sm:px-4 sm:first:pl-5";

  return (
    <Table className="table-fixed" containerClassName="min-w-0 overflow-x-hidden">
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className={cn(thClass, "w-[62%]")}>{cols.payout}</TableHead>
          <TableHead className={cn(thClass, "w-[38%] text-right last:pr-4 sm:last:pr-5")}>
            {cols.amount}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {batches.map((batch) => {
          const href = `${detailHrefPrefix}/${batch.id}`;
          const rowLabel = `View payout: ${batch.label}`;

          return (
            <TableRow
              key={batch.id}
              tabIndex={0}
              aria-label={rowLabel}
              onClick={() => router.push(href)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  router.push(href);
                }
              }}
              className="cursor-pointer border-border/60 align-top hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <TableCell className="px-3 py-2.5 align-top first:pl-4 sm:px-4 sm:first:pl-5">
                <p className="ts-row-title line-clamp-2 leading-snug">
                  {batch.label}
                </p>
                <p className="ts-row-meta mt-0.5">{payoutDateLabel(batch)}</p>
                <div className="mt-1 flex flex-wrap items-center gap-1.5">
                  <p className="ts-row-meta">{entryCountLabel(batch.entryCount)}</p>
                  <PayoutSourceBadge source={batch.source} />
                </div>
              </TableCell>
              <TableCell className="px-3 py-2.5 align-top text-right last:pr-4 sm:px-4 sm:last:pr-5">
                <p className="ts-amount whitespace-nowrap tabular-nums text-emerald-700">
                  {formatCurrency(batch.totalAmount)}
                </p>
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
