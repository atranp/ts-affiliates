"use client";

import { useState } from "react";
import { AddAdjustmentDialog } from "@/components/admin/AddAdjustmentDialog";
import { AdminLedgerTable } from "@/components/admin/AdminLedgerTable";
import { EmptyState } from "@/components/admin/EmptyState";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAdminLedgerMutations } from "@/hooks/use-admin-ledger-mutations";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ledgerTabToFilters, useLedger, type LedgerTab } from "@/hooks/use-ledger";
import type { AdminAffiliateDetail } from "@/lib/admin/types";
import type { TeamSummary } from "@/lib/teams/queries";

/**
 * Filter state is owned by the parent: the stat cards and the teams tab jump
 * straight into a filtered ledger, and inactive tabs unmount.
 */
export function AffiliateLedgerTab({
  affiliateId,
  summary,
  teams,
  ledgerTab,
  onLedgerTabChange,
  teamFilter,
  onTeamFilterChange,
  page,
  onPageChange,
  q,
  onSearchChange,
}: {
  affiliateId: string;
  summary: AdminAffiliateDetail["ledger"];
  teams: TeamSummary[] | undefined;
  ledgerTab: LedgerTab;
  onLedgerTabChange: (tab: LedgerTab) => void;
  teamFilter: string;
  onTeamFilterChange: (teamId: string) => void;
  page: number;
  onPageChange: (page: number) => void;
  q: string;
  onSearchChange: (q: string) => void;
}) {
  const debouncedQ = useDebouncedValue(q);
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const mutations = useAdminLedgerMutations(affiliateId);

  const {
    data: ledger,
    error,
    isLoading,
    refetch,
    isFetching,
  } = useLedger({
    affiliateId,
    ...ledgerTabToFilters(ledgerTab),
    q: debouncedQ,
    teamId: teamFilter !== "all" ? teamFilter : undefined,
    page,
    limit: 50,
    enabled: !!affiliateId,
  });

  async function handleAddAdjustment(data: {
    amount: number;
    description: string;
    status: string;
  }) {
    await mutations.addAdjustment(data);
    setAdjustmentOpen(false);
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ledger</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {error && <ErrorState message={error.message} onRetry={() => refetch()} />}

        {isLoading && <TableSkeleton columns={7} rows={6} />}

        {!isLoading && !error && ledger && (
          <div className="space-y-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <Input
                placeholder="Search order ID or description..."
                value={q}
                onChange={(e) => {
                  onSearchChange(e.target.value);
                  onPageChange(1);
                }}
                className="sm:max-w-sm"
              />
              {teams && teams.length > 0 && (
                <select
                  className="select-field sm:max-w-xs"
                  value={teamFilter}
                  onChange={(e) => {
                    onTeamFilterChange(e.target.value);
                    onPageChange(1);
                  }}
                >
                  <option value="all">All teams</option>
                  {teams.map((team) => (
                    <option key={team.id} value={team.id}>
                      {team.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <Tabs
              value={ledgerTab}
              onValueChange={(v) => {
                onLedgerTabChange(v as LedgerTab);
                onPageChange(1);
              }}
            >
              <TabsList className="flex h-auto w-full flex-wrap justify-start">
                <TabsTrigger value="all">All</TabsTrigger>
                <TabsTrigger value="unpaid">Unpaid</TabsTrigger>
                <TabsTrigger value="paid">Paid</TabsTrigger>
                <TabsTrigger value="pending">
                  Pending
                  {summary.pendingCount > 0 ? ` (${summary.pendingCount})` : ""}
                </TabsTrigger>
                <TabsTrigger value="rejected">
                  Rejected
                  {summary.rejectedCount > 0 ? ` (${summary.rejectedCount})` : ""}
                </TabsTrigger>
                <TabsTrigger value="overrides">Overrides</TabsTrigger>
              </TabsList>
              <TabsContent value={ledgerTab} className="space-y-4">
                {ledger.entries.length === 0 ? (
                  <EmptyState title="No ledger entries" />
                ) : (
                  <>
                    <AdminLedgerTable
                      entries={ledger.entries}
                      loading={isFetching || mutations.saving}
                      onUpdateEntry={mutations.updateEntry}
                      onBulkStatus={mutations.bulkStatus}
                      onAddAdjustment={() => setAdjustmentOpen(true)}
                    />
                    {ledger.totalPages > 1 && (
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                        <p className="text-sm text-muted-foreground">
                          Page {ledger.page} of {ledger.totalPages} ·{" "}
                          {ledger.total} entries
                          {isFetching ? " · updating..." : ""}
                        </p>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page <= 1}
                            onClick={() => onPageChange(page - 1)}
                          >
                            Previous
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={page >= ledger.totalPages}
                            onClick={() => onPageChange(page + 1)}
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </TabsContent>
            </Tabs>
          </div>
        )}
      </CardContent>

      <AddAdjustmentDialog
        open={adjustmentOpen}
        loading={mutations.saving}
        onClose={() => setAdjustmentOpen(false)}
        onSubmit={handleAddAdjustment}
      />
    </Card>
  );
}
