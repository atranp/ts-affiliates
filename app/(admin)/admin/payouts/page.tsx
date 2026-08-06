"use client";

import { Suspense, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
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
        <div className="space-y-6 p-6">
          <div className="h-8 w-48 animate-pulse rounded bg-muted" />
          <TableSkeleton columns={4} rows={2} />
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
    <div className="space-y-6">
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

      <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
        <div className="ts-card p-5">
          <h2 className="mb-4 text-base font-semibold text-brand-dark">
            Record payout
          </h2>
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
