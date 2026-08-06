"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Download, History, Search } from "lucide-react";
import { EmptyState } from "@/components/admin/EmptyState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import type { PayoutStatusFilter } from "@/components/payouts/PayoutStatsCards";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { adminMutate } from "@/hooks/use-admin-query";
import { isPayoutPaid, payoutStatusLabel } from "@/lib/payouts/status";
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
  statusFilter: PayoutStatusFilter;
  onStatusFilterChange: (filter: PayoutStatusFilter) => void;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh?: () => void;
};

const FILTERS: Array<{ id: PayoutStatusFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "awaiting", label: "Awaiting" },
  { id: "paid", label: "Paid" },
];

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
  const haystack = [
    batch.label,
    batch.teamName,
    batch.sponsorName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(query);
}

function exportAwaitingCsv(batches: PayoutBatchRow[]) {
  const awaiting = batches.filter((batch) => !isPayoutPaid(batch.status));
  if (awaiting.length === 0) {
    toast.message("Nothing to export", {
      description: "No awaiting batches match the current filters.",
    });
    return;
  }

  const header = ["Payout", "Affiliate", "Team", "Date", "Total", "Status"];
  const rows = awaiting.map((batch) => [
    batch.label,
    batch.sponsorName ?? "",
    batch.teamName ?? "",
    batchDate(batch),
    batch.totalAmount.toFixed(2),
    payoutStatusLabel(batch.status),
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
  link.download = `awaiting-payouts-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function PayoutHistoryPanel({
  batches,
  loading,
  sponsorAffiliateId,
  statusFilter,
  onStatusFilterChange,
  search,
  onSearchChange,
  onRefresh,
}: PayoutHistoryPanelProps) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkLoading, setBulkLoading] = useState(false);

  const filtered = useMemo(() => {
    const query = search.trim().toLowerCase();
    return batches.filter((batch) => {
      if (sponsorAffiliateId && batch.sponsorAffiliateId !== sponsorAffiliateId) {
        return false;
      }
      if (statusFilter === "awaiting" && isPayoutPaid(batch.status)) {
        return false;
      }
      if (statusFilter === "paid" && !isPayoutPaid(batch.status)) {
        return false;
      }
      return matchesSearch(batch, query);
    });
  }, [batches, search, sponsorAffiliateId, statusFilter]);

  const awaitingVisible = filtered.filter((batch) => !isPayoutPaid(batch.status));
  const allAwaitingSelected =
    awaitingVisible.length > 0 &&
    awaitingVisible.every((batch) => selected.has(batch.id));

  function toggleAllAwaiting(checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      for (const batch of awaitingVisible) {
        if (checked) next.add(batch.id);
        else next.delete(batch.id);
      }
      return next;
    });
  }

  function toggleOne(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function confirmSelectedSent() {
    const ids = Array.from(selected).filter((id) =>
      awaitingVisible.some((batch) => batch.id === id)
    );
    if (ids.length === 0) return;

    setBulkLoading(true);
    try {
      const result = await adminMutate<{ updated: number }>(
        "/api/admin/payouts/batches/bulk-paid",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids }),
        }
      );
      toast.success(
        result.updated === 1
          ? "1 payout confirmed sent"
          : `${result.updated} payouts confirmed sent`
      );
      setSelected(new Set());
      onRefresh?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not update payouts"
      );
    } finally {
      setBulkLoading(false);
    }
  }

  return (
    <div className="ts-card flex min-h-[420px] flex-col">
      <div className="border-b border-border px-5 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <History className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-brand-dark">
              Payout history
            </h2>
            {sponsorAffiliateId && (
              <Badge variant="secondary" className="font-normal">
                Filtered
              </Badge>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {selected.size > 0 && (
              <Button
                size="sm"
                disabled={bulkLoading}
                onClick={() => void confirmSelectedSent()}
              >
                Confirm sent ({selected.size})
              </Button>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => exportAwaitingCsv(filtered)}
            >
              <Download className="mr-2 h-4 w-4" />
              Export awaiting
            </Button>
          </div>
        </div>

        <div className="ts-table-toolbar mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search payouts, teams, affiliates..."
              className="h-10 pl-9"
            />
          </div>
          <div className="flex flex-wrap gap-1">
            {FILTERS.map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => onStatusFilterChange(filter.id)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                  statusFilter === filter.id
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
                )}
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 p-5">
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
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-10">
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-border"
                        checked={allAwaitingSelected}
                        onChange={(event) =>
                          toggleAllAwaiting(event.target.checked)
                        }
                        aria-label="Select all awaiting payouts"
                      />
                    </TableHead>
                    <TableHead>Payout</TableHead>
                    {!sponsorAffiliateId && <TableHead>Affiliate</TableHead>}
                    <TableHead>Team</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((batch) => {
                    const paid = isPayoutPaid(batch.status);
                    return (
                      <TableRow
                        key={batch.id}
                        className="cursor-pointer"
                        onClick={() => router.push(`/admin/payouts/${batch.id}`)}
                      >
                        <TableCell onClick={(event) => event.stopPropagation()}>
                          {!paid && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border"
                              checked={selected.has(batch.id)}
                              onChange={(event) =>
                                toggleOne(batch.id, event.target.checked)
                              }
                              aria-label={`Select ${batch.label}`}
                            />
                          )}
                        </TableCell>
                        <TableCell>
                          <p className="font-medium">{batch.label}</p>
                          <p className="text-xs text-muted-foreground">
                            {batchCounts(batch)}
                          </p>
                        </TableCell>
                        {!sponsorAffiliateId && (
                          <TableCell className="text-sm">
                            {batch.sponsorName ?? (
                              <span className="text-muted-foreground">—</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="text-sm">
                          {batch.teamName ?? (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-sm text-muted-foreground">
                          {batchDate(batch)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap text-right font-medium tabular-nums">
                          {formatCurrency(batch.totalAmount)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={paid ? "paid" : "pending"}>
                            {payoutStatusLabel(batch.status)}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            }
            cards={
              <DataCardList>
                {filtered.map((batch) => {
                  const paid = isPayoutPaid(batch.status);
                  return (
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
                      <DataCardMeta className="justify-between">
                        <div className="flex items-center gap-2">
                          {!paid && (
                            <input
                              type="checkbox"
                              className="h-4 w-4 rounded border-border"
                              checked={selected.has(batch.id)}
                              onChange={(event) =>
                                toggleOne(batch.id, event.target.checked)
                              }
                              aria-label={`Select ${batch.label}`}
                            />
                          )}
                          <Badge variant={paid ? "paid" : "pending"}>
                            {payoutStatusLabel(batch.status)}
                          </Badge>
                        </div>
                      </DataCardMeta>
                    </DataCard>
                  );
                })}
              </DataCardList>
            }
          />
        )}
      </div>
    </div>
  );
}
