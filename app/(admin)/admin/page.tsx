"use client";

import Link from "next/link";
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  DollarSign,
  Scale,
  Shield,
  ShoppingBag,
  SlidersHorizontal,
  Users,
} from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { StatCard, StatCardSkeleton } from "@/components/admin/StatCard";
import { ErrorState } from "@/components/admin/ErrorState";
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
      <PageHeader
        title="Admin Operations Console"
        description="Internal management dashboard for True Sciences affiliate partner network and custom payout rules."
      />

      {error && (
        <ErrorState message={error.message} onRetry={() => refetch()} />
      )}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => <StatCardSkeleton key={i} />)
        ) : data ? (
          <>
            <Link
              href="/admin/affiliates"
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <StatCard
                label="Total Affiliates"
                value={String(data.affiliates.total)}
                hint={`${data.affiliates.active} active partners`}
                variant="primary"
                icon={Users}
                footer={
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                }
              />
            </Link>
            <Link
              href="/admin/payouts"
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <StatCard
                label="Unpaid Total"
                value={formatCurrency(data.ledger.unpaidTotal)}
                hint="Ready for payout run"
                variant="primary"
                icon={DollarSign}
                footer={
                  <ArrowRight className="h-4 w-4 text-primary transition-transform group-hover:translate-x-1" />
                }
              />
            </Link>
            <Link
              href="/admin/payouts"
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <StatCard
                label="Paid Total"
                value={formatCurrency(data.ledger.paidTotal)}
                hint="Lifetime disbursements"
                variant="success"
                icon={CheckCircle2}
                footer={
                  <ArrowRight className="h-4 w-4 text-emerald-700 transition-transform group-hover:translate-x-1" />
                }
              />
            </Link>
            <Link
              href="/admin/affiliates"
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
            >
              <StatCard
                label="Pending Review"
                value={formatCurrency(data.ledger.pendingTotal)}
                hint="Pending sales milestones"
                variant="warning"
                icon={Clock}
                footer={
                  <ArrowRight className="h-4 w-4 text-amber-700 transition-transform group-hover:translate-x-1" />
                }
              />
            </Link>
          </>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="ts-card space-y-4 p-5">
          <div className="border-b border-border pb-3">
            <h2 className="text-base font-bold text-brand-dark">
              Operations Quick Actions
            </h2>
            <p className="text-xs text-muted-foreground">
              Shortcuts for internal admin workflows
            </p>
          </div>

          <div className="space-y-2.5">
            {[
              {
                href: "/admin/affiliates",
                icon: Users,
                iconClass: "bg-primary text-white",
                title: "Browse & Manage Affiliates",
                desc: "View affiliate status, portal invites, and manual adjustments",
              },
              {
                href: "/admin/payouts",
                icon: DollarSign,
                iconClass: "bg-emerald-700 text-white",
                title: "Execute Custom Payout Run",
                desc: "Select sponsor/team, date range, preview run, and mark paid",
              },
              {
                href: "/admin/deal-rules",
                icon: Scale,
                iconClass: "bg-purple-700 text-white",
                title: "Configure Custom Deal Rules",
                desc: "Set revenue overrides, recruit rates, and sales milestone triggers",
              },
            ].map((action) => {
              const Icon = action.icon;
              return (
                <Link
                  key={action.href}
                  href={action.href}
                  className="group flex items-center justify-between rounded-lg border border-border bg-muted/50 p-3 transition-all hover:border-primary hover:bg-card"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`rounded-md p-2 ${action.iconClass}`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-xs font-semibold text-brand-dark">
                        {action.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {action.desc}
                      </div>
                    </div>
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary" />
                </Link>
              );
            })}
          </div>
        </div>

        <div className="ts-card space-y-4 p-5">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div>
              <h2 className="text-base font-bold text-brand-dark">
                WooCommerce + SliceWP Engine
              </h2>
              <p className="text-xs text-muted-foreground">
                Background data synchronization status
              </p>
            </div>
            <Link
              href="/admin/settings"
              className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
            >
              Settings
              <SlidersHorizontal className="h-3.5 w-3.5" />
            </Link>
          </div>

          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : data ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-xs">
                <div className="flex items-center gap-2">
                  <ShoppingBag className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-foreground">
                    WooCommerce API Store Engine
                  </span>
                </div>
                <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {data.sync.hasWooCommerce ? "Connected" : "Not configured"}
                </span>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-border bg-muted p-3 text-xs">
                <div className="flex items-center gap-2">
                  <Shield className="h-4 w-4 text-primary" />
                  <span className="font-semibold text-foreground">
                    SliceWP Affiliate Bridge
                  </span>
                </div>
                <span className="rounded border border-emerald-300 bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-800">
                  {data.sync.hasSliceWP ? "Connected" : "Not configured"}
                </span>
              </div>

              <div className="space-y-1 rounded-lg border border-border bg-muted p-3 text-xs">
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Last Automated Sync:</span>
                  <span className="font-mono font-semibold text-brand-dark">
                    {formatSyncTime(data.sync.lastCommissionSyncAt)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-muted-foreground">
                  <span>Last Affiliate Sync:</span>
                  <span className="font-mono font-semibold text-brand-dark">
                    {formatSyncTime(data.sync.lastAffiliateSyncAt)}
                  </span>
                </div>
              </div>

              <p className="text-xs text-muted-foreground">
                Sync runs automatically every 6 hours. Use &quot;Sync now&quot; in
                the header if you need fresh data immediately.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
