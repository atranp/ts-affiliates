"use client";

import { ChevronDown, ChevronRight, ChevronUp, ReceiptText } from "lucide-react";
import { CommissionRow, commissionAmountTone } from "@/components/affiliate/CommissionRow";
import { CommissionTypeBadge } from "@/components/affiliate/AffiliateBadge";
import {
  formatCommissionStatus,
  AFFILIATE_COPY,
} from "@/lib/affiliate/copy";
import { formatAppDate } from "@/lib/timezone";
import { formatCurrency, formatSaleDate, cn } from "@/lib/utils";
import type { LedgerSortKey, SortDirection } from "@/lib/ledger/sort";
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
  trackedByClick?: boolean | null;
  isLifetimeSale?: boolean;
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
  const tone = commissionAmountTone(status);
  if (tone === "success") return "text-emerald-700";
  if (tone === "warning") return "text-amber-700";
  if (tone === "primary") return "text-primary";
  return "text-brand-dark";
}

function formatPayoutWeek(iso: string | null) {
  if (!iso) return "—";
  return formatAppDate(iso, {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function SortableHead({
  sortKey,
  activeKey,
  direction,
  onSort,
  align = "left",
  className,
  children,
}: {
  sortKey: LedgerSortKey;
  activeKey: LedgerSortKey;
  direction: SortDirection;
  onSort: (key: LedgerSortKey) => void;
  align?: "left" | "right";
  className?: string;
  children: React.ReactNode;
}) {
  const active = activeKey === sortKey;

  return (
    <TableHead
      className={cn(className, align === "right" && "text-right")}
      aria-sort={
        active
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none"
      }
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 transition-colors hover:text-brand-dark",
          align === "right" && "flex-row-reverse",
          active ? "text-brand-dark" : "text-muted-foreground"
        )}
      >
        {children}
        {active &&
          (direction === "asc" ? (
            <ChevronUp className="h-3 w-3 text-primary" />
          ) : (
            <ChevronDown className="h-3 w-3 text-primary" />
          ))}
      </button>
    </TableHead>
  );
}

export function LedgerTable({
  entries,
  showDetails = false,
  affiliateView = false,
  fillHeight = false,
  sortKey,
  sortDir,
  onSort,
  onEntryClick,
  isFetching = false,
}: {
  entries: LedgerEntry[];
  showDetails?: boolean;
  affiliateView?: boolean;
  fillHeight?: boolean;
  sortKey?: LedgerSortKey;
  sortDir?: SortDirection;
  onSort?: (key: LedgerSortKey) => void;
  onEntryClick?: (entryId: string) => void;
  isFetching?: boolean;
}) {
  if (entries.length === 0) {
    return (
      <div
        className={cn(
          "px-4 py-10 sm:px-5",
          fillHeight && "flex min-h-0 flex-1 items-center justify-center",
        )}
      >
        <div className="ts-empty-inline mx-auto max-w-md text-center">
          <span className="mb-3 inline-flex rounded-full bg-muted/60 p-2.5">
            <ReceiptText
              className="h-5 w-5 text-muted-foreground"
              aria-hidden
            />
          </span>
          <p className="leading-relaxed">
            {affiliateView
              ? AFFILIATE_COPY.commissions.empty
              : "No entries yet."}
          </p>
        </div>
      </div>
    );
  }

  const cols = affiliateView ? AFFILIATE_COPY.commissions.columns : null;
  const sortable = affiliateView && !!onSort && !!sortKey && !!sortDir;
  const clickable = affiliateView && !!onEntryClick;
  const thClass = affiliateView
    ? "ts-table-header sticky top-0 z-10 h-9 whitespace-nowrap bg-muted/30 px-3 text-[11px] backdrop-blur-sm first:pl-4 sm:px-4 sm:first:pl-5"
    : "ts-table-header sticky top-0 z-10 h-11 bg-muted/95 px-4 backdrop-blur-sm";
  const tdClass = affiliateView
    ? "px-3 py-2.5 align-top first:pl-4 sm:px-4 sm:first:pl-5"
    : "px-4";
  const rowClass = affiliateView
    ? "border-border/60 hover:bg-muted/25"
    : undefined;

  const renderHead = (
    key: LedgerSortKey,
    label: string,
    align: "left" | "right" = "left",
    extraClass?: string
  ) => {
    const className = cn(thClass, extraClass);

    if (sortable) {
      return (
        <SortableHead
          key={key}
          sortKey={key}
          activeKey={sortKey!}
          direction={sortDir!}
          onSort={onSort!}
          align={align}
          className={className}
        >
          {label}
        </SortableHead>
      );
    }

    return (
      <TableHead key={key} className={className}>
        {label}
      </TableHead>
    );
  };

  const cards = affiliateView ? (
    <ul
      className={cn(
        "ts-commission-mobile-list",
        fillHeight && "min-h-0",
      )}
    >
      {entries.map((entry) => {
        const status = entry.status;
        const details =
          entry.description ??
          entry.sourceAffiliate?.displayName ??
          entry.sourceAffiliate?.email ??
          "—";

        return (
          <li key={entry.id}>
            <CommissionRow
              layout="mobile"
              details={details}
              occurredAt={entry.occurredAt}
              orderRevenue={entry.orderRevenue}
              amount={formatCurrency(entry.amount)}
              status={status}
              type={entry.type}
              payoutWeek={entry.payoutWeek}
              trackedByClick={entry.trackedByClick}
              isLifetimeSale={entry.isLifetimeSale}
              onClick={
                onEntryClick ? () => onEntryClick(entry.id) : undefined
              }
            />
          </li>
        );
      })}
    </ul>
  ) : (
    <DataCardList className={fillHeight ? "p-3 md:hidden" : "md:hidden"}>
      {entries.map((entry) => {
        const status = entry.status;
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
              value={<span>{formatCurrency(entry.amount)}</span>}
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
              <span>{entry.type === "OVERRIDE" ? "Team bonus" : entry.type}</span>
              {entry.wooOrderId && !details.includes(`#${entry.wooOrderId}`) && (
                <span>Order #{entry.wooOrderId}</span>
              )}
            </DataCardMeta>
          </DataCard>
        );
      })}
    </DataCardList>
  );

  const table = (
    <Table
      className={cn(
        affiliateView && "table-fixed",
        isFetching && "ts-table-body-fetching",
      )}
      containerClassName={cn(
        affiliateView && "min-w-0 overflow-x-hidden",
        affiliateView && fillHeight && "ts-table-body-scroll",
      )}
    >
      {affiliateView ? (
        <colgroup>
          <col className="w-[16%]" />
          <col className="w-[14%]" />
          <col className="w-[30%]" />
          <col className="w-[13%]" />
          <col className="w-[13%]" />
          <col className="w-[12%]" />
          {clickable ? <col className="w-[2%]" /> : null}
        </colgroup>
      ) : null}
      <TableHeader>
        <TableRow
          className={cn(
            affiliateView
              ? "border-border/60 hover:bg-transparent"
              : "border-border/80 hover:bg-transparent",
          )}
        >
          {renderHead("date", cols?.date ?? "Date", "left")}
          {renderHead("type", cols?.type ?? "Type")}
          {showDetails &&
            renderHead("details", cols?.details ?? "Details")}
          {!showDetails && <TableHead className={thClass}>Source</TableHead>}
          {!affiliateView && <TableHead className={thClass}>Order</TableHead>}
          {renderHead("sale", cols?.sale ?? "Sale", "right")}
          {renderHead("amount", cols?.amount ?? "Amount", "right")}
          {showDetails && !affiliateView && (
            <TableHead className={thClass}>
              {cols?.payout ?? "Payout week"}
            </TableHead>
          )}
          {renderHead(
            "status",
            cols?.status ?? "Status",
            "left",
            affiliateView ? "last:pr-4 sm:last:pr-5" : "last:pr-5",
          )}
          {clickable ? (
            <TableHead
              className={cn(thClass, "w-8 px-0 text-right last:pr-3 sm:last:pr-4")}
              aria-hidden
            >
              <span className="sr-only">Open details</span>
            </TableHead>
          ) : null}
        </TableRow>
      </TableHeader>
      <TableBody>
        {entries.map((entry) => {
          const status = entry.status;
          const clickableRow = affiliateView && !!onEntryClick;
          const details =
            entry.description ??
            entry.sourceAffiliate?.displayName ??
            entry.sourceAffiliate?.email ??
            "—";

          return (
            <TableRow
              key={entry.id}
              tabIndex={clickableRow ? 0 : undefined}
              aria-label={
                clickableRow
                  ? `${AFFILIATE_COPY.commissions.detail.openHint}: ${details}`
                  : undefined
              }
              onClick={
                clickableRow ? () => onEntryClick!(entry.id) : undefined
              }
              onKeyDown={
                clickableRow
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onEntryClick!(entry.id);
                      }
                    }
                  : undefined
              }
              className={cn(
                rowClass,
                clickableRow &&
                  "cursor-pointer hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring",
              )}
            >
              <TableCell
                className={cn(
                  tdClass,
                  "ts-row-meta whitespace-nowrap",
                )}
              >
                {formatSaleDate(entry.occurredAt)}
              </TableCell>
              <TableCell className={tdClass}>
                {affiliateView ? (
                  <CommissionTypeBadge
                    type={entry.type}
                    isLifetimeSale={entry.isLifetimeSale}
                  />
                ) : (
                  <Badge
                    variant={entry.type === "OVERRIDE" ? "team" : "direct"}
                  >
                    {entry.type === "OVERRIDE" ? "Team bonus" : entry.type}
                  </Badge>
                )}
              </TableCell>
              {showDetails ? (
                <TableCell className={cn(tdClass, "min-w-0 align-middle")}>
                  <p className="ts-row-title truncate leading-5">
                    {entry.description ??
                      entry.sourceAffiliate?.displayName ??
                      entry.sourceAffiliate?.email ??
                      "—"}
                  </p>
                  <p className="ts-row-meta mt-0.5 truncate leading-4">
                    {[
                      entry.type === "OVERRIDE"
                        ? "Team earnings"
                        : entry.isLifetimeSale
                          ? "Lifetime sale"
                          : "Direct sale",
                      entry.isLifetimeSale
                        ? "Linked customer"
                        : entry.trackedByClick === true
                          ? "Link click"
                          : entry.trackedByClick === false
                            ? "No click"
                            : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {entry.sourceAffiliate && !affiliateView && (
                    <p className="ts-row-meta mt-0.5">
                      Source:{" "}
                      {entry.sourceAffiliate.displayName ??
                        entry.sourceAffiliate.email}
                    </p>
                  )}
                </TableCell>
              ) : (
                <TableCell className={cn(tdClass, "ts-row-title")}>
                  {entry.sourceAffiliate?.displayName ??
                    entry.sourceAffiliate?.email ??
                    "—"}
                </TableCell>
              )}
              {!affiliateView && (
                <TableCell className={cn(tdClass, "ts-row-meta font-mono")}>
                  {entry.wooOrderId ? `#${entry.wooOrderId}` : "—"}
                </TableCell>
              )}
              <TableCell
                className={cn(
                  tdClass,
                  "ts-row-meta whitespace-nowrap text-right tabular-nums",
                )}
              >
                {entry.orderRevenue
                  ? formatCurrency(entry.orderRevenue)
                  : "—"}
              </TableCell>
              <TableCell
                className={cn(
                  tdClass,
                  "ts-amount whitespace-nowrap text-right",
                  affiliateView ? amountClass(status) : "text-emerald-700",
                )}
              >
                {formatCurrency(entry.amount)}
              </TableCell>
              {showDetails && !affiliateView && (
                <TableCell className={cn(tdClass, "ts-row-meta")}>
                  {formatPayoutWeek(entry.payoutWeek)}
                </TableCell>
              )}
              <TableCell
                className={cn(
                  tdClass,
                  affiliateView && "align-middle last:pr-4 sm:last:pr-5",
                )}
              >
                {affiliateView ? (
                  <span className="ts-row-meta truncate font-medium leading-4">
                    {formatCommissionStatus(status)}
                    {status === "PAID" && entry.payoutWeek ? (
                      <>
                        <span className="text-muted-foreground/50"> · </span>
                        <span className="font-normal">
                          {formatPayoutWeek(entry.payoutWeek)}
                        </span>
                      </>
                    ) : null}
                  </span>
                ) : (
                  <Badge variant={statusVariant(status)}>
                    {formatCommissionStatus(status)}
                  </Badge>
                )}
              </TableCell>
              {clickableRow ? (
                <TableCell
                  className={cn(
                    tdClass,
                    "w-8 px-0 text-right align-middle last:pr-3 sm:last:pr-4",
                  )}
                >
                  <ChevronRight
                    className="ts-commission-chevron ml-auto"
                    aria-hidden
                  />
                </TableCell>
              ) : null}
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  if (affiliateView && fillHeight) {
    return (
      <>
        <div className="hidden min-h-0 flex-1 flex-col overflow-hidden ts-table-body md:flex">
          {table}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain md:hidden">
          {cards}
        </div>
      </>
    );
  }

  return <ResponsiveTable table={table} cards={cards} />;
}
