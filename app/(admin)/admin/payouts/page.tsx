"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { PenLine, Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import type { AffiliateOption } from "@/components/admin/AffiliateSearchCombobox";
import { ErrorState } from "@/components/admin/ErrorState";
import { TableSkeleton } from "@/components/admin/TableSkeleton";
import { PayoutBuilder } from "@/components/payouts/PayoutBuilder";
import {
  PayoutHistoryPanel,
  type PayoutBatchRow,
} from "@/components/payouts/PayoutHistoryPanel";
import { SelectedAffiliateBanner } from "@/components/payouts/SelectedAffiliateBanner";
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { AdminAffiliateDetail } from "@/lib/admin/types";

export default function AdminPayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="ts-workspace gap-4">
          <div className="h-9 w-40 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="grid min-h-0 flex-1 gap-6 xl:grid-cols-2">
            <div className="animate-pulse rounded-xl bg-muted" />
            <div className="animate-pulse rounded-xl bg-muted" />
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
  const [search, setSearch] = useState("");

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
    await Promise.all([refetchSponsor(), refetchBatches()]);
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
    <div className="ts-workspace gap-4">
      <div className="shrink-0 space-y-4">
        <PageHeader
          title="Payouts"
          description="Create payout receipts that list what each transfer includes."
          actions={
            <Button size="sm" asChild>
              <Link href="/admin/payouts/new">
                <Plus className="mr-2 h-4 w-4" />
                New payout
              </Link>
            </Button>
          }
        />

        {sponsorId && sponsor && (
          <SelectedAffiliateBanner
            displayName={sponsorDisplayName}
            unpaidTotal={sponsor.ledger.unpaidTotal}
            onClear={clearSponsor}
          />
        )}
      </div>

      <div className="grid min-h-0 flex-1 grid-rows-2 gap-4 xl:grid-cols-2 xl:grid-rows-1 xl:gap-6">
        <div className="ts-panel flex min-h-0 flex-col">
          <div className="ts-panel-header shrink-0">
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
          <div className="ts-panel-body ts-panel-scroll">
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
          className="min-h-0"
          batches={batchesData?.batches ?? []}
          loading={batchesLoading}
          sponsorAffiliateId={sponsorId || undefined}
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
