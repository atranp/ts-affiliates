"use client";

import { useParams } from "next/navigation";
import { PayoutBatchDetailView } from "@/components/payouts/PayoutBatchDetailView";
import { ErrorState } from "@/components/admin/ErrorState";
import { useAdminQuery } from "@/hooks/use-admin-query";
import type { PayoutBatchDetail } from "@/lib/payouts/types";

export default function AdminPayoutDetailPage() {
  const params = useParams<{ id: string }>();

  const { data, error, isLoading, refetch } = useAdminQuery<{ batch: PayoutBatchDetail }>(
    ["admin", "payout-batch", params.id],
    `/api/admin/payouts/batches/${params.id}`
  );

  if (isLoading) {
    return <p className="text-muted-foreground">Loading payout...</p>;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!data?.batch) {
    return <p className="text-muted-foreground">Payout not found.</p>;
  }

  const batch = data.batch;
  const backHref = batch.sponsorAffiliateId
    ? `/admin/affiliates/${batch.sponsorAffiliateId}?tab=payouts`
    : "/admin/payouts";

  return (
    <PayoutBatchDetailView
      batch={batch}
      adminView
      backHref={backHref}
      backLabel={
        batch.sponsorAffiliateId ? "Back to affiliate payouts" : "Back to payouts"
      }
    />
  );
}
