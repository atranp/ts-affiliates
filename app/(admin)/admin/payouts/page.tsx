"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Plus } from "lucide-react";
import { PageHeader } from "@/components/admin/PageHeader";
import { Button } from "@/components/ui/button";
import {
  PayoutHistoryPanel,
  type PayoutBatchRow,
} from "@/components/payouts/PayoutHistoryPanel";
import { useAdminQuery } from "@/hooks/use-admin-query";

export default function AdminPayoutsPage() {
  return (
    <Suspense
      fallback={
        <div className="ts-workspace gap-4">
          <div className="h-9 w-40 shrink-0 animate-pulse rounded-lg bg-muted" />
          <div className="min-h-0 flex-1 animate-pulse rounded-xl bg-muted" />
        </div>
      }
    >
      <AdminPayoutsPageContent />
    </Suspense>
  );
}

function AdminPayoutsPageContent() {
  const searchParams = useSearchParams();
  const sponsorId = searchParams.get("sponsorAffiliateId") ?? "";
  const [search, setSearch] = useState("");

  const {
    data: batchesData,
    isLoading,
    refetch,
  } = useAdminQuery<{ batches: PayoutBatchRow[] }>(
    ["admin", "payout-batches"],
    "/api/admin/payouts/batches"
  );

  return (
    <div className="ts-workspace gap-4">
      <div className="shrink-0">
        <PageHeader
          title="Payouts"
          description="Every payout receipt, and what each transfer covered."
          actions={
            <Button size="sm" asChild>
              <Link href="/admin/payouts/new">
                <Plus className="mr-2 h-4 w-4" />
                New payout
              </Link>
            </Button>
          }
        />
      </div>

      <PayoutHistoryPanel
        className="min-h-0 flex-1"
        batches={batchesData?.batches ?? []}
        loading={isLoading}
        sponsorAffiliateId={sponsorId || undefined}
        search={search}
        onSearchChange={setSearch}
        onRefresh={() => {
          void refetch();
        }}
      />
    </div>
  );
}
