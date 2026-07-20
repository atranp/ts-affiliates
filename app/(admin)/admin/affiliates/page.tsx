"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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
        title="Affiliates"
        description="Synced from SliceWP — search, filter, and review portal access"
      />

      <Card>
        <CardHeader>
          <CardTitle>Directory</CardTitle>
          <CardDescription>
            {data
              ? `${data.total} affiliate${data.total === 1 ? "" : "s"} total`
              : "Loading affiliate directory..."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row">
            <Input
              placeholder="Search name, email, or SliceWP ID..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="sm:max-w-sm"
            />
            <select
              className="select-field sm:w-44"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option === "all" ? "All statuses" : option}
                </option>
              ))}
            </select>
          </div>

          {error && (
            <ErrorState message={error.message} onRetry={() => refetch()} />
          )}

          {(isLoading || isFetching) && !data && (
            <TableSkeleton columns={6} rows={8} />
          )}

          {!isLoading && !error && data?.items.length === 0 && (
            <EmptyState
              title="No affiliates found"
              description={
                debouncedQ || status !== "all"
                  ? "Try adjusting your search or filters."
                  : "Run a sync from the overview to import affiliates from SliceWP."
              }
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
                  <TableRow>
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
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => router.push(`/admin/affiliates/${affiliate.id}`)}
                    >
                      <TableCell className="font-medium text-primary">
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
                      <TableCell>
                        <Badge
                          variant={
                            affiliate.hasPortalAccess ? "paid" : "outline"
                          }
                        >
                          {affiliate.hasPortalAccess ? "Linked" : "No login"}
                        </Badge>
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
        </CardContent>
      </Card>
    </div>
  );
}
