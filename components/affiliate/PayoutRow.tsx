"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { AffiliateAmountCell } from "@/components/affiliate/primitives";
import { PayoutSourceBadge } from "@/components/payouts/PayoutSourceBadge";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { PayoutSource } from "@/lib/payouts/types";
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

export type PayoutRowData = {
  id: string;
  source: PayoutSource;
  label: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
  entryCount: number;
  totalAmount: number;
};

function payoutDateLabel(
  batch: Pick<PayoutRowData, "processedAt" | "createdAt">,
  withYear = false,
) {
  const dateIso = batch.processedAt ?? batch.createdAt;
  return formatAppDate(dateIso, {
    month: "short",
    day: "numeric",
    ...(withYear ? { year: "numeric" } : {}),
  });
}

function entryCountLabel(count: number) {
  return `${count.toLocaleString()} ${
    count === 1 ? "commission" : "commissions"
  }`;
}

type PayoutRowProps = PayoutRowData & {
  href?: string;
  layout?: "card" | "flat";
  className?: string;
};

export function PayoutRow({
  source,
  label,
  processedAt,
  createdAt,
  entryCount,
  totalAmount,
  href,
  layout = "card",
  className,
}: PayoutRowProps) {
  const flat = layout === "flat";
  const dateLabel = payoutDateLabel({ processedAt, createdAt }, flat);
  const entriesLabel = entryCountLabel(entryCount);

  const content = flat ? (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 flex-1 space-y-1">
        <p className="ts-row-title line-clamp-2 leading-snug">{label}</p>
        <p className="ts-row-meta">{dateLabel}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <p className="ts-row-meta">{entriesLabel}</p>
          <PayoutSourceBadge source={source} />
        </div>
      </div>
      <p className="ts-amount shrink-0 whitespace-nowrap tabular-nums text-emerald-700">
        {formatCurrency(totalAmount)}
      </p>
    </div>
  ) : (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="ts-row-title min-w-0 flex-1 leading-snug">{label}</p>
        <AffiliateAmountCell
          amount={formatCurrency(totalAmount)}
          tone="success"
        />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1.5">
          <p className="ts-row-meta min-w-0 truncate">{dateLabel}</p>
          <PayoutSourceBadge source={source} />
        </div>
        <p className="ts-row-meta shrink-0 text-right">{entriesLabel}</p>
      </div>
    </>
  );

  const rowClass = cn(
    "min-w-0 max-w-full",
    flat
      ? "ts-divider-row"
      : "ts-list-row flex-col items-stretch gap-1.5",
    className,
  );

  if (href) {
    return (
      <Link href={href} className={rowClass}>
        {content}
      </Link>
    );
  }

  return <div className={rowClass}>{content}</div>;
}

export function PayoutDesktopTable({
  batches,
  detailHrefPrefix,
}: {
  batches: PayoutRowData[];
  detailHrefPrefix: string;
}) {
  const router = useRouter();
  const cols = AFFILIATE_COPY.payouts.columns;
  const thClass =
    "ts-table-header h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] first:pl-4 sm:px-4 sm:first:pl-5";
  const tdClass = "px-3 py-2.5 align-top first:pl-4 sm:px-4 sm:first:pl-5";

  return (
    <Table
      className="table-fixed"
      containerClassName="min-w-0 overflow-x-hidden"
    >
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className={cn(thClass, "w-[34%]")}>{cols.payout}</TableHead>
          <TableHead className={cn(thClass, "w-[16%]")}>{cols.date}</TableHead>
          <TableHead className={cn(thClass, "w-[22%]")}>{cols.commissions}</TableHead>
          <TableHead
            className={cn(
              thClass,
              "w-[28%] text-right last:pr-4 sm:last:pr-5",
            )}
          >
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
              <TableCell className={tdClass}>
                <p className="ts-row-title line-clamp-2 leading-snug">
                  {batch.label}
                </p>
                <div className="mt-1">
                  <PayoutSourceBadge source={batch.source} />
                </div>
              </TableCell>
              <TableCell className={cn(tdClass, "ts-row-meta whitespace-nowrap")}>
                {payoutDateLabel(batch, true)}
              </TableCell>
              <TableCell className={cn(tdClass, "ts-row-meta tabular-nums")}>
                {entryCountLabel(batch.entryCount)}
              </TableCell>
              <TableCell
                className={cn(
                  tdClass,
                  "text-right last:pr-4 sm:last:pr-5",
                )}
              >
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
