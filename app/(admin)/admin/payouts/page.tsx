"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PenLine } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { PayoutBuilder } from "@/components/payouts/PayoutBuilder";
import {
  PayoutHistoryPanel,
  type PayoutBatchRow,
} from "@/components/payouts/PayoutHistoryPanel";
import {
  PayoutStatsCards,
  type PayoutStatusFilter,
} from "@/components/payouts/PayoutStatsCards";
import { SelectedAffiliateBanner } from "@/components/payouts/SelectedAffiliateBanner";
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { AdminAffiliateDetail } from "@/lib/admin/types";
import type { PayoutAdminStats } from "@/lib/payouts/admin-stats";

export default function AdminPayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="space-y-8">
          <div className="h-9 w-40 animate-pulse rounded-lg bg-muted" />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-28 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        </div>
      }
    >
      <AdminPayoutsPageContent />
    </Suspense>
  );
}

function AdminPayoutsPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const sponsorId = searchParams.get("sponsorAffiliateId") ?? "";
  const initialTeamId = searchParams.get("teamId") ?? undefined;
  const [statusFilter, setStatusFilter] = useState<PayoutStatusFilter>("all");
  const [search, setSearch] = useState("");

  const {
    data: stats,
    isLoading: statsLoading,
    refetch: refetchStats,
  } = useAdminQuery<PayoutAdminStats>(
    ["admin", "payout-stats"],
    "/api/admin/payouts/stats"
  );

  const {
    data: sponsor,
    isLoading: sponsorLoading,
    error: sponsorError,
    refetch: refetchSponsor,
  } = useAdminQuery<AdminAffiliateDetail>(
    ["admin", "affiliate", sponsorId],
    sponsorId ? `/api/admin/affiliates/${sponsorId}` : null
  );

  const {
    data: batchesData,
    isLoading: batchesLoading,
    refetch: refetchBatches,
  } = useAdminQuery<{ batches: PayoutBatchRow[] }>(
    ["admin", "payout-batches"],
    "/api/admin/payouts/batches"
  );

  function selectSponsor(id: string) {
    const next = new URLSearchParams();
    if (id) next.set("sponsorAffiliateId", id);
    const query = next.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, {
      scroll: false,
    });
  }

  function clearSponsor() {
    selectSponsor("");
  }

  async function refreshAll() {
    await Promise.all([refetchStats(), refetchSponsor(), refetchBatches()]);
  }

  const selectedOption: AffiliateOption | null = sponsor
    ? {
        id: sponsor.id,
        email: sponsor.email,
        displayName: sponsor.displayName,
        slicewpId: sponsor.slicewpId,
        status: sponsor.status,
      }
    : null;

  const sponsorDisplayName =
    sponsor?.displayName ?? sponsor?.email ?? "Selected affiliate";

  return (
    <div className="space-y-8">
      <PageHeader
        title="Payouts"
        description="Record what ambassadors are owed, then confirm once money is sent."
      />

      <PayoutStatsCards
        stats={stats}
        loading={statsLoading}
        onFilter={setStatusFilter}
        onShowOwed={clearSponsor}
      />

      {sponsorId && sponsor && (
        <SelectedAffiliateBanner
          displayName={sponsorDisplayName}
          unpaidTotal={sponsor.ledger.unpaidTotal}
          onClear={clearSponsor}
        />
      )}

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start xl:gap-8">
        <div className="ts-panel">
          <div className="ts-panel-header">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <PenLine className="h-4 w-4" />
              </div>
              <div>
                <h2 className="ts-section-title">Record payout</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Select an ambassador, period, and scope
                </p>
              </div>
            </div>
          </div>
          <div className="ts-panel-body">
            {sponsorId && sponsorError ? (
              <ErrorState
                message={sponsorError.message}
                onRetry={() => refetchSponsor()}
              />
            ) : sponsorId && sponsorLoading ? (
              <TableSkeleton columns={3} rows={4} />
            ) : (
              <PayoutBuilder
                affiliateId={sponsor?.id ?? null}
                displayName={sponsor?.displayName ?? sponsor?.email ?? null}
                selectedAffiliate={selectedOption}
                onAffiliateChange={selectSponsor}
                initialTeamId={initialTeamId}
                embedHistory={false}
                onBatchCreated={() => {
                  void refreshAll();
                }}
              />
            )}
          </div>
        </div>

        <PayoutHistoryPanel
          batches={batchesData?.batches ?? []}
          loading={batchesLoading}
          sponsorAffiliateId={sponsorId || undefined}
          statusFilter={statusFilter}
          onStatusFilterChange={setStatusFilter}
          search={search}
          onSearchChange={setSearch}
          onRefresh={() => {
            void refreshAll();
          }}
        />
      </div>
    </div>
  );
}
