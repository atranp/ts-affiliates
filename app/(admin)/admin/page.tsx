"use client";

import Link from "next/link";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { ArrowRight, RefreshCw, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { ConfirmDialog } from "@/components/admin/ConfirmDialog";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  adminMutate,
  useAdminStats,
} from "@/hooks/use-admin-query";
import type { SyncResult } from "@/lib/admin/types";
import { formatCurrency } from "@/lib/utils";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminDashboardPage() {
  const queryClient = useQueryClient();
  const { data, error, isLoading, refetch } = useAdminStats();
  const [syncOpen, setSyncOpen] = useState(false);
  const [syncing, setSyncing] = useState(false);

  async function runSync() {
    setSyncing(true);
    try {
      const result = await adminMutate<SyncResult>("/api/sync", {
        method: "POST",
      });
      toast.success(
        `Synced ${result.affiliatesUpserted} affiliates, ${result.commissionsUpserted} commissions, ${result.profilesLinked} profiles linked`
      );
      setSyncOpen(false);
      await queryClient.invalidateQueries({ queryKey: ["admin"] });
      await queryClient.invalidateQueries({ queryKey: ["ledger"] });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Overview"
        description="Platform health, payouts, and sync status at a glance"
        actions={
          <Button onClick={() => setSyncOpen(true)} disabled={syncing}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${syncing ? "animate-spin" : ""}`}
            />
            {syncing ? "Syncing..." : "Run Full Sync"}
          </Button>
        }
      />

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <StatCard
              label="Affiliates"
              value={String(data.affiliates.total)}
              hint={`${data.affiliates.active} active · ${data.affiliates.withPortalAccess} with portal access`}
              variant="primary"
            />
            <StatCard
              label="Unpaid"
              value={formatCurrency(data.ledger.unpaidTotal)}
              hint={`${data.ledger.unpaidCount} ledger entries`}
              variant="primary"
            />
            <StatCard
              label="Paid"
              value={formatCurrency(data.ledger.paidTotal)}
              hint={`${data.ledger.paidCount} entries paid`}
              variant="success"
            />
            <StatCard
              label="Pending review"
              value={formatCurrency(data.ledger.pendingTotal)}
              hint={`${data.dealRules.active} active deal rules`}
              variant="warning"
            />
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
            <CardDescription>Common admin workflows</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <Button variant="outline" className="justify-between" asChild>
              <Link href="/admin/affiliates">
                <span className="flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Browse affiliates
                </span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link href="/admin/deal-rules">
                <span>Manage deal rules</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <Button variant="outline" className="justify-between" asChild>
              <Link href="/admin/settings">
                <span>Integration settings</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sync & integrations</CardTitle>
            <CardDescription>
              Data is read from Supabase — SliceWP sync runs on a schedule or
              manually
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading ? (
              <p className="text-muted-foreground">Loading status...</p>
            ) : data ? (
              <>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">WooCommerce</span>
                  <span
                    className={
                      data.sync.hasWooCommerce
                        ? "font-medium text-success"
                        : "font-medium text-warning"
                    }
                  >
                    {data.sync.hasWooCommerce ? "Configured" : "Not configured"}
                  </span>
                </div>
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">SliceWP</span>
                  <span
                    className={
                      data.sync.hasSliceWP
                        ? "font-medium text-success"
                        : "font-medium text-warning"
                    }
                  >
                    {data.sync.hasSliceWP ? "Configured" : "Not configured"}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t pt-3">
                  <span className="text-muted-foreground">Last affiliate sync</span>
                  <span className="text-right font-medium">
                    {formatSyncTime(data.sync.lastAffiliateSyncAt)}
                  </span>
                </div>
                <div className="flex justify-between gap-4 border-t pt-3">
                  <span className="text-muted-foreground">Last commission sync</span>
                  <span className="text-right font-medium">
                    {formatSyncTime(data.sync.lastCommissionSyncAt)}
                  </span>
                </div>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <ConfirmDialog
        open={syncOpen}
        title="Run full sync?"
        description="Pulls all affiliates and commissions from SliceWP. Large stores may take several minutes. No emails are sent to affiliates."
        confirmLabel="Start sync"
        loading={syncing}
        onConfirm={runSync}
        onCancel={() => setSyncOpen(false)}
      />
    </div>
  );
}
