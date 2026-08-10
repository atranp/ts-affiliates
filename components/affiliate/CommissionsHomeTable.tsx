"use client";

import { CommissionTypeBadge } from "@/components/affiliate/AffiliateBadge";
import { commissionAmountTone } from "@/components/affiliate/CommissionRow";
import { formatCommissionStatus } from "@/lib/affiliate/copy";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { LedgerEntry } from "@/lib/ledger/types";
import { cn, formatCurrency, formatSaleDate } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const cols = AFFILIATE_COPY.home.commissionsColumns;

type CommissionsHomeTableProps = {
  entries: LedgerEntry[];
  onRowClick?: () => void;
};

function entryDetails(entry: LedgerEntry) {
  return (
    entry.description ??
    entry.sourceAffiliate?.displayName ??
    entry.sourceAffiliate?.email ??
    "—"
  );
}

function amountClassForStatus(status: string) {
  const tone = commissionAmountTone(status);
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "primary") return "text-primary";
  return "text-brand-dark";
}

export function CommissionsHomeTableSkeleton() {
  const thClass =
    "ts-table-header h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] first:pl-4 sm:px-4 sm:first:pl-5";

  return (
    <Table className="table-fixed" containerClassName="min-w-0 overflow-x-hidden">
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className={cn(thClass, "w-[58%] sm:w-[38%]")}>
            {cols.details}
          </TableHead>
          <TableHead className={cn(thClass, "hidden sm:table-cell sm:w-[22%]")}>
            {cols.type}
          </TableHead>
          <TableHead className={cn(thClass, "w-[42%] text-right sm:w-[20%]")}>
            {cols.amount}
          </TableHead>
          <TableHead
            className={cn(
              thClass,
              "hidden w-[20%] sm:table-cell sm:last:pr-5",
            )}
          >
            {cols.status}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {[0, 1, 2].map((i) => (
          <TableRow key={i} className="border-border/60 hover:bg-transparent">
            <TableCell className="px-3 py-2.5 first:pl-4 sm:px-4 sm:first:pl-5">
              <div className="space-y-1.5">
                <div className="h-4 w-3/4 max-w-[12rem] animate-pulse rounded bg-muted" />
                <div className="h-3 w-20 animate-pulse rounded bg-muted/80" />
              </div>
            </TableCell>
            <TableCell className="hidden px-3 py-2.5 sm:table-cell sm:px-4">
              <div className="h-6 w-24 animate-pulse rounded-full bg-muted/80" />
            </TableCell>
            <TableCell className="px-3 py-2.5 text-right sm:px-4">
              <div className="ml-auto h-4 w-14 animate-pulse rounded bg-muted" />
            </TableCell>
            <TableCell className="hidden px-3 py-2.5 sm:table-cell sm:px-4 sm:last:pr-5">
              <div className="h-3 w-12 animate-pulse rounded bg-muted/80" />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export function CommissionsHomeTable({
  entries,
  onRowClick,
}: CommissionsHomeTableProps) {
  const thClass =
    "ts-table-header h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] first:pl-4 sm:px-4 sm:first:pl-5";

  return (
    <Table className="table-fixed" containerClassName="min-w-0 overflow-x-hidden">
      <TableHeader>
        <TableRow className="border-border/60 hover:bg-transparent">
          <TableHead className={cn(thClass, "w-[58%] sm:w-[38%]")}>
            {cols.details}
          </TableHead>
          <TableHead className={cn(thClass, "hidden sm:table-cell sm:w-[22%]")}>
            {cols.type}
          </TableHead>
          <TableHead className={cn(thClass, "w-[42%] text-right sm:w-[20%]")}>
            {cols.amount}
          </TableHead>
          <TableHead
            className={cn(
              thClass,
              "hidden w-[20%] sm:table-cell sm:last:pr-5",
            )}
          >
            {cols.status}
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const status = entry.status;
          const details = entryDetails(entry);
          const dateLabel = formatSaleDate(entry.occurredAt);
          const rowLabel = `View commission: ${details}`;

          return (
            <TableRow
              key={entry.id}
              tabIndex={onRowClick ? 0 : undefined}
              aria-label={onRowClick ? rowLabel : undefined}
              onClick={onRowClick}
              onKeyDown={
                onRowClick
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onRowClick();
                      }
                    }
                  : undefined
              }
              className={cn(
                "border-border/60 align-top",
                onRowClick &&
                  "cursor-pointer hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              <TableCell className="px-3 py-2.5 align-top first:pl-4 sm:px-4 sm:first:pl-5">
                <p className="ts-row-title line-clamp-2 leading-snug sm:truncate">
                  {details}
                </p>
                <p className="ts-row-meta mt-0.5">{dateLabel}</p>
                <div className="mt-1.5 sm:hidden">
                  <CommissionTypeBadge type={entry.type} />
                </div>
              </TableCell>
              <TableCell className="hidden px-3 py-2.5 align-top sm:table-cell sm:px-4">
                <CommissionTypeBadge type={entry.type} />
              </TableCell>
              <TableCell className="px-3 py-2.5 align-top text-right sm:px-4">
                <p
                  className={cn(
                    "ts-amount whitespace-nowrap tabular-nums",
                    amountClassForStatus(status),
                  )}
                >
                  {formatCurrency(entry.amount)}
                </p>
                <p className="ts-row-meta mt-0.5 font-medium sm:hidden">
                  {formatCommissionStatus(status)}
                </p>
              </TableCell>
              <TableCell className="ts-row-meta hidden px-3 py-2.5 align-top font-medium sm:table-cell sm:px-4 sm:last:pr-5">
                {formatCommissionStatus(status)}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
