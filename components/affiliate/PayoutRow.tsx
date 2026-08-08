"use client";

import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { AffiliateAmountCell } from "@/components/affiliate/primitives";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { formatAppDate } from "@/lib/timezone";
import { cn, formatCurrency } from "@/lib/utils";

export type PayoutRowData = {
  id: string;
  label: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
  entryCount: number;
  totalAmount: number;
};

function payoutDateLabel(
  batch: Pick<PayoutRowData, "processedAt" | "createdAt">,
) {
  const dateIso = batch.processedAt ?? batch.createdAt;
  return formatAppDate(dateIso, {
    month: "short",
    day: "numeric",
  });
}

function entryCountLabel(count: number) {
  return `${count.toLocaleString()} ${
    count === 1 ? "commission" : "commissions"
  }`;
}

type PayoutRowProps = PayoutRowData & {
  href?: string;
  className?: string;
};

export function PayoutRow({
  label,
  processedAt,
  createdAt,
  entryCount,
  totalAmount,
  href,
  className,
}: PayoutRowProps) {
  const dateLabel = payoutDateLabel({
    processedAt,
    createdAt,
  });
  const entriesLabel = entryCountLabel(entryCount);

  const content = (
    <>
      <div className="flex min-w-0 items-start justify-between gap-3">
        <p className="ts-row-title min-w-0 flex-1 leading-snug">{label}</p>
        <AffiliateAmountCell amount={formatCurrency(totalAmount)} tone="success" />
      </div>
      <div className="flex min-w-0 items-center justify-between gap-2">
        <p className="ts-row-meta min-w-0 truncate">{dateLabel}</p>
        <p className="ts-row-meta shrink-0 text-right">{entriesLabel}</p>
      </div>
    </>
  );

  const rowClass = cn(
    "ts-list-row min-w-0 max-w-full flex-col items-stretch gap-1.5",
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
  return (
    <div className="overflow-x-auto">
      <table className="w-full caption-bottom text-sm">
        <thead>
          <tr className="border-b border-border/80 hover:bg-transparent">
            <th className="ts-table-header h-11 px-4 text-left first:pl-5">
              {AFFILIATE_COPY.payouts.columns.payout}
            </th>
            <th className="ts-table-header h-11 px-4 text-left">
              {AFFILIATE_COPY.payouts.columns.date}
            </th>
            <th className="ts-table-header h-11 px-4 text-left">
              {AFFILIATE_COPY.payouts.columns.commissions}
            </th>
            <th className="ts-table-header h-11 px-4 text-right">
              {AFFILIATE_COPY.payouts.columns.amount}
            </th>
            <th className="ts-table-header h-11 w-10 px-2 last:pr-5">
              <span className="sr-only">View</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {batches.map((batch) => {
            const href = `${detailHrefPrefix}/${batch.id}`;
            return (
              <tr
                key={batch.id}
                className="border-b border-border/60 transition-colors hover:bg-muted/50"
              >
                <td className="px-4 py-3.5 first:pl-5">
                  <Link
                    href={href}
                    className="font-semibold text-brand-dark transition-colors hover:text-primary hover:underline"
                  >
                    {batch.label}
                  </Link>
                </td>
                <td className="ts-row-meta whitespace-nowrap px-4 py-3.5">
                  {payoutDateLabel(batch)}
                </td>
                <td className="ts-row-meta px-4 py-3.5 tabular-nums">
                  {entryCountLabel(batch.entryCount)}
                </td>
                <td className="px-4 py-3.5 text-right">
                  <AffiliateAmountCell
                    amount={formatCurrency(batch.totalAmount)}
                    tone="success"
                  />
                </td>
                <td className="px-2 py-3.5 text-right last:pr-5">
                  <Link
                    href={href}
                    className="inline-flex text-muted-foreground transition-colors hover:text-primary"
                    aria-label={`View ${batch.label}`}
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
