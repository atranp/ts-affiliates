"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Check, Minus, Search } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAdminAffiliates } from "@/hooks/use-admin-query";
import { formatCurrency } from "@/lib/utils";

const STATUS_OPTIONS = ["all", "ACTIVE", "PENDING", "INACTIVE", "REJECTED"];

function statusBadgeVariant(
  status: string
): "paid" | "pending" | "secondary" | "destructive" {
  switch (status) {
    case "ACTIVE":
      return "paid";
    case "PENDING":
      return "pending";
    case "REJECTED":
      return "destructive";
    default:
      return "secondary";
  }
}

export default function AdminAffiliatesPage() {
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [status, setStatus] = useState("all");

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQ(q);
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [q]);

  const { data, error, isLoading, refetch, isFetching } = useAdminAffiliates({
    page,
    q: debouncedQ,
    status,
  });

  const resetFilters = useCallback(() => {
    setQ("");
    setDebouncedQ("");
    setStatus("all");
    setPage(1);
  }, []);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Affiliate Partners Directory"
        description="Manage partner profiles, portal access permissions, ledger adjustments, and team sponsors."
      />

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="ts-table-toolbar">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="relative min-w-[240px] flex-1">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search affiliate name, email, or team..."
                value={q}
                onChange={(e) => setQ(e.target.value)}
                className="rounded-lg bg-card pl-9"
              />
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {STATUS_OPTIONS.map((option) => {
                const label =
                  option === "all" ? "All" : option.charAt(0) + option.slice(1).toLowerCase();
                const isActive = status === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => {
                      setStatus(option);
                      setPage(1);
                    }}
                    className={
                      isActive
                        ? "filter-pill filter-pill-active"
                        : "filter-pill filter-pill-inactive"
                    }
                  >
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="p-4 space-y-4">

          {error && (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          )}

          {(isLoading || isFetching) && !data && (
            <TableSkeleton columns={6} rows={8} />
          )}

          {!isLoading && !error && data?.items.length === 0 && (
            <EmptyState
              title="No affiliates found"
              action={
                debouncedQ || status !== "all" ? (
                  <Button variant="outline" onClick={resetFilters}>
                    Clear filters
                  </Button>
                ) : undefined
              }
            />
          )}

          {!isLoading && !error && data && data.items.length > 0 && (
            <>
              <Table>
                <TableHeader>
                  <TableRow className="ts-table-header hover:bg-muted">
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>SliceWP ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Portal</TableHead>
                    <TableHead className="text-right">Unpaid</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((affiliate) => (
                    <TableRow 
                      key={affiliate.id} 
                      className="cursor-pointer hover:bg-muted/80"
                      onClick={() => router.push(`/admin/affiliates/${affiliate.id}`)}
                    >
                      <TableCell className="font-bold text-brand-dark">
                        {affiliate.displayName ?? "—"}
                      </TableCell>
                      <TableCell>
                        {affiliate.email}
                      </TableCell>
                      <TableCell>{affiliate.slicewpId}</TableCell>
                      <TableCell>
                        <Badge variant={statusBadgeVariant(affiliate.status)}>
                          {affiliate.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center">
                        {affiliate.hasPortalAccess ? (
                          <Check
                            className="mx-auto h-4 w-4 text-success"
                            aria-label="Portal linked"
                          />
                        ) : (
                          <Minus
                            className="mx-auto h-4 w-4 text-muted-foreground"
                            aria-label="No portal login"
                          />
                        )}
                      </TableCell>
                      <TableCell className="text-right font-medium text-primary">
                        {formatCurrency(affiliate.unpaidTotal)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages}
                </p>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page <= 1}
                    onClick={() => setPage((p) => p - 1)}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={page >= data.totalPages}
                    onClick={() => setPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
