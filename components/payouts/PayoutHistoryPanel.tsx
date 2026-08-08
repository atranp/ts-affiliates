"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, History, Search } from "lucide-react";
import { EmptyState } from "@/components/admin/EmptyState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DataCard,
  DataCardHeader,
  DataCardList,
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
import { formatAppDate } from "@/lib/timezone";
import { cn, formatCurrency } from "@/lib/utils";

export type PayoutBatchRow = {
  id: string;
  label: string;
  status: string;
  processedAt: string | null;
  createdAt: string;
  teamName: string | null;
  sponsorAffiliateId?: string | null;
  sponsorName?: string | null;
  entryCount: number;
  affiliateCount: number;
  totalAmount: number;
};

type PayoutHistoryPanelProps = {
  batches: PayoutBatchRow[];
  loading?: boolean;
  sponsorAffiliateId?: string;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh?: () => void;
  className?: string;
};

function batchDate(batch: PayoutBatchRow) {
  return formatAppDate(batch.processedAt ?? batch.createdAt);
}

function batchCounts(batch: PayoutBatchRow) {
  const sales = `${batch.entryCount.toLocaleString("en-US")} sales`;
  const people = `${batch.affiliateCount} ${batch.affiliateCount === 1 ? "affiliate" : "affiliates"}`;
  return `${sales} · ${people}`;
}

function matchesSearch(batch: PayoutBatchRow, query: string) {
  if (!query) return true;
  const haystack = [batch.label, batch.teamName, batch.sponsorName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function exportCsv(batches: PayoutBatchRow[]) {
  if (batches.length === 0) {
    toast.message("Nothing to export", {
      description: "No payouts match the current filters.",
    });
    return;
  }

  const header = ["Payout", "Ambassador", "Team", "Date", "Total", "Sales"];
  const rows = batches.map((batch) => [
    batch.label,
    batch.sponsorName ?? "",
    batch.teamName ?? "",
    batchDate(batch),
    batch.totalAmount.toFixed(2),
    String(batch.entryCount),
  ]);

  const csv = [header, ...rows]
    .map((row) =>
      row
        .map((cell) =>
          /[",\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell
        )
        .join(",")
    )
    .join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `payouts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PayoutHistoryPanel({
  batches,
  loading,
  sponsorAffiliateId,
  search,
  onSearchChange,
  className,
}: PayoutHistoryPanelProps) {
  const router = useRouter();

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (sponsorAffiliateId && batch.sponsorAffiliateId !== sponsorAffiliateId) {
        return false;
      }
      return matchesSearch(batch, query);
    });
  }, [batches, search, sponsorAffiliateId]);

  return (
    <div className={cn("ts-panel flex min-h-0 flex-col", className)}>
      <div className="ts-panel-header shrink-0 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <History className="h-4 w-4" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="ts-section-title">Payout history</h2>
                {sponsorAffiliateId && (
                  <Badge
                    variant="secondary"
                    className="h-5 rounded-md px-2 text-[10px] font-semibold uppercase tracking-wide"
                  >
                    Filtered
                  </Badge>
                )}
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {filtered.length} {filtered.length === 1 ? "receipt" : "receipts"}
              </p>
            </div>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="rounded-lg"
            onClick={() => exportCsv(filtered)}
          >
            <Download className="mr-1.5 h-3.5 w-3.5" />
            Export
          </Button>
        </div>

        <div className="relative min-w-0">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            placeholder="Search payouts, teams, ambassadors…"
            className="ts-input pl-9"
          />
        </div>
      </div>

      <div className="ts-panel-body ts-panel-scroll flex-1">
        {loading && <TableSkeleton columns={5} rows={8} />}
        {!loading && filtered.length === 0 && (
          <EmptyState
            title="No payouts match"
            description={
              sponsorAffiliateId
                ? "Try clearing the affiliate filter or widening your search."
                : "Record a payout on the left to get started."
            }
            icon={History}
          />
        )}
        {!loading && filtered.length > 0 && (
          <ResponsiveTable
            table={
              <div className="ts-table-wrap">
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead className="bg-muted/40">Payout</TableHead>
                      {!sponsorAffiliateId && (
                        <TableHead className="bg-muted/40">Ambassador</TableHead>
                      )}
                      <TableHead className="bg-muted/40">Team</TableHead>
                      <TableHead className="bg-muted/40">Date</TableHead>
                      <TableHead className="bg-muted/40 text-right">Total</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filtered.map((batch) => (
                      <TableRow
                        key={batch.id}
                        className="cursor-pointer hover:bg-muted/40"
                        onClick={() => router.push(`/admin/payouts/${batch.id}`)}
                      >
                        <TableCell>
                          <p className="font-semibold text-brand-dark">
                            {batch.label}
                          </p>
                          <p className="mt-0.5 text-xs text-muted-foreground">
                            {batchCounts(batch)}
                          </p>
                        </TableCell>
                        {!sponsorAffiliateId && (
                          <TableCell className="text-sm text-foreground/90">
                            {batch.sponsorName ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-sm text-foreground/90">
                          {batch.teamName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {batchDate(batch)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right text-sm font-semibold tabular-nums text-brand-dark">
                          {formatCurrency(batch.totalAmount)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            cards={
              <DataCardList>
                {filtered.map((batch) => (
                  <DataCard key={batch.id}>
                    <button
                      type="button"
                      className="w-full text-left"
                      onClick={() => router.push(`/admin/payouts/${batch.id}`)}
                    >
                      <DataCardHeader
                        title={batch.label}
                        subtitle={
                          sponsorAffiliateId
                            ? `${batchDate(batch)} · ${batchCounts(batch)}`
                            : [
                                batch.sponsorName,
                                batch.teamName,
                                batchDate(batch),
                              ]
                                .filter(Boolean)
                                .join(" · ")
                        }
                        value={formatCurrency(batch.totalAmount)}
                      />
                    </button>
                  </DataCard>
                ))}
              </DataCardList>
            }
          />
        )}
      </div>
    </div>
  );
}
