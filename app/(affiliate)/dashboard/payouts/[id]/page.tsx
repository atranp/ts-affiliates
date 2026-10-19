"use client";

import { useParams } from "next/navigation";
import { PayoutBatchDetailView } from "@/components/payouts/PayoutBatchDetailView";
import { ErrorState } from "@/components/admin/ErrorState";
import { PayoutDetailSkeleton } from "@/components/affiliate/DashboardSkeleton";
import { AffiliateEmptyState } from "@/components/affiliate/primitives";
import { useAffiliatePayout } from "@/hooks/use-payouts";

export default function AffiliatePayoutDetailPage() {
  const params = useParams<{ id: string }>();

  const { data, error, isLoading, refetch } = useAffiliatePayout(params.id);

  if (isLoading) {
    return <PayoutDetailSkeleton />;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!data?.batch) {
    return (
      <AffiliateEmptyState>
        Payout not found. It may have been removed or you may not have access.
      </AffiliateEmptyState>
    );
  }

  return (
    <PayoutBatchDetailView
      batch={data.batch}
      backHref="/dashboard?tab=payouts"
      backLabel="Back to payouts"
    />
  );
}
