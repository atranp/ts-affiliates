"use client";

import Link from "next/link";
import { ArrowRight, Users } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useAdminStats } from "@/hooks/use-admin-query";
import { formatCurrency } from "@/lib/utils";

function formatSyncTime(iso: string | null) {
  if (!iso) return "Never";
  return new Date(iso).toLocaleString("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function AdminDashboardPage() {
  const { data, error, isLoading, refetch } = useAdminStats();

  return (
    <div className="space-y-6">
      <PageHeader title="Overview" />

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <Link href="/admin/affiliates" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
              <StatCard
                label="Affiliates"
                value={String(data.affiliates.total)}
                hint={`${data.affiliates.active} active · ${data.affiliates.withPortalAccess} portal`}
                variant="primary"
                className="hover:border-primary/50 transition-colors"
              />
            </Link>
            <Link href="/admin/affiliates?status=ACTIVE" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
              <StatCard
                label="Unpaid"
                value={formatCurrency(data.ledger.unpaidTotal)}
                hint={`${data.ledger.unpaidCount} ledger entries`}
                variant="primary"
                className="hover:border-primary/50 transition-colors"
              />
            </Link>
            <Link href="/admin/affiliates?status=ACTIVE" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
              <StatCard
                label="Paid"
                value={formatCurrency(data.ledger.paidTotal)}
                hint={`${data.ledger.paidCount} entries paid`}
                variant="success"
                className="hover:border-primary/50 transition-colors"
              />
            </Link>
            <Link href="/admin/deal-rules" className="block focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 rounded-xl">
              <StatCard
                label="Pending review"
                value={formatCurrency(data.ledger.pendingTotal)}
                hint={`${data.dealRules.active} active deal rules`}
                variant="warning"
                className="hover:border-warning/50 transition-colors"
              />
            </Link>
          </>
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Quick actions</CardTitle>
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
            <CardTitle>Integrations</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {isLoading ? (
              <p className="text-muted-foreground">Loading…</p>
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
                <div className="flex justify-between gap-4">
                  <span className="text-muted-foreground">Last commission sync</span>
                  <span className="text-right font-medium">
                    {formatSyncTime(data.sync.lastCommissionSyncAt)}
                  </span>
                </div>
                <p className="border-t pt-3 text-xs text-muted-foreground">
                  Sync runs automatically every 6 hours. Use &quot;Sync now&quot; above
                  if you need fresh data immediately.
                </p>
              </>
            ) : null}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
