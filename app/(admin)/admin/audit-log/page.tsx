"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { PageHeader } from "@/components/admin/PageHeader";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
import { useAdminQuery } from "@/hooks/use-admin-query";

type AuditEntry = {
  id: string;
  action: string;
  createdAt: string;
  metadata: Record<string, unknown> | null;
  admin: { id: string; email: string | null; name: string | null };
  affiliate: {
    id: string;
    email: string | null;
    displayName: string | null;
    slicewpId: number | null;
  } | null;
};

type AuditResponse = {
  entries: AuditEntry[];
  total: number;
  page: number;
  pageSize: number;
};

const ACTION_FILTERS = [
  { value: "all", label: "All actions" },
  { value: "AFFILIATE_UPDATE", label: "Affiliate edits" },
  { value: "IMPERSONATE_START", label: "Impersonation" },
  { value: "PORTAL_CREATE", label: "Portal created" },
  { value: "PORTAL_RESET_PASSWORD", label: "Password resets" },
  { value: "PORTAL_DISABLE", label: "Access disabled" },
];

function actionVariant(action: string) {
  if (action.startsWith("AFFILIATE_")) return "direct" as const;
  if (action.startsWith("IMPERSONATE_")) return "pending" as const;
  if (action === "PORTAL_DISABLE") return "destructive" as const;
  return "secondary" as const;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Renders the `changes` payload written by affiliate edits. Anything else falls
 * back to raw JSON so a new action type is still readable before it gets a
 * dedicated formatter.
 */
function describeChange(entry: AuditEntry) {
  const metadata = entry.metadata;
  if (!metadata) return "—";

  const changes = metadata.changes as Record<string, unknown> | undefined;
  const previous = metadata.previous as Record<string, unknown> | undefined;

  if (!changes) {
    const keys = Object.keys(metadata);
    return keys.length ? keys.map((k) => `${k}: ${String(metadata[k])}`).join(", ") : "—";
  }

  return Object.entries(changes)
    .map(([key, value]) => {
      const before = previous?.[key];
      const after = value === null ? "cleared" : String(value);
      return before === undefined || before === null
        ? `${key} → ${after}`
        : `${key}: ${String(before)} → ${after}`;
    })
    .join(", ");
}

function AuditLogPageContent() {
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("all");

  const { data, error, isLoading, refetch } = useAdminQuery<AuditResponse>(
    ["admin", "audit-log", page, action],
    `/api/admin/audit-log?page=${page}&action=${action}`
  );

  const entries = data?.entries ?? [];
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-6">
      <PageHeader title="Audit Log" />

      {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

      <div className="ts-table-wrap">
        <div className="ts-table-toolbar flex-wrap gap-3">
          <div>
            <h2 className="ts-section-title">Admin actions</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data ? `${data.total} recorded` : "—"}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {ACTION_FILTERS.map((filter) => (
              <Button
                key={filter.value}
                size="sm"
                variant={action === filter.value ? "default" : "outline"}
                onClick={() => {
                  setAction(filter.value);
                  setPage(1);
                }}
              >
                {filter.label}
              </Button>
            ))}
          </div>
        </div>

        <div className="ts-table-body p-4 sm:p-5">
          {isLoading && <TableSkeleton columns={4} />}
          {!isLoading && entries.length === 0 && (
            <EmptyState title="Nothing recorded yet" />
          )}
          {!isLoading && entries.length > 0 && (
            <ResponsiveTable
              table={
                <Table>
                  <TableHeader>
                    <TableRow className="ts-table-header hover:bg-muted">
                      <TableHead className="w-[180px]">When</TableHead>
                      <TableHead className="w-[170px]">Action</TableHead>
                      <TableHead>Affiliate</TableHead>
                      <TableHead>Change</TableHead>
                      <TableHead className="w-[200px]">By</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell className="whitespace-nowrap text-muted-foreground">
                          {formatDate(entry.createdAt)}
                        </TableCell>
                        <TableCell>
                          <Badge variant={actionVariant(entry.action)}>
                            {entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {entry.affiliate ? (
                            <Link
                              href={`/admin/affiliates/${entry.affiliate.id}`}
                              className="font-medium hover:underline"
                            >
                              {entry.affiliate.displayName ??
                                entry.affiliate.email ??
                                entry.affiliate.id}
                            </Link>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {describeChange(entry)}
                        </TableCell>
                        <TableCell className="break-all text-muted-foreground">
                          {entry.admin.name ?? entry.admin.email ?? entry.admin.id}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              }
              cards={
                <DataCardList>
                  {entries.map((entry) => (
                    <DataCard key={entry.id}>
                      <DataCardHeader
                        title={
                          entry.affiliate?.displayName ??
                          entry.affiliate?.email ??
                          "System"
                        }
                        subtitle={describeChange(entry)}
                      />
                      <DataCardMeta className="justify-between">
                        <Badge variant={actionVariant(entry.action)}>
                          {entry.action}
                        </Badge>
                        <span>{formatDate(entry.createdAt)}</span>
                      </DataCardMeta>
                    </DataCard>
                  ))}
                </DataCardList>
              }
            />
          )}
        </div>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Page {page} of {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

export default function AuditLogPage() {
  return (
    <Suspense fallback={<TableSkeleton columns={5} />}>
      <AuditLogPageContent />
    </Suspense>
  );
}
