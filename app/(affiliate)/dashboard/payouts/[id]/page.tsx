"use client";

import { useParams } from "next/navigation";
import { PayoutBatchDetailView } from "@/components/payouts/PayoutBatchDetailView";
import { ErrorState } from "@/components/admin/ErrorState";
import { useQuery } from "@tanstack/react-query";
import { apiFetch } from "@/lib/api-client";
import type { PayoutBatchDetail } from "@/lib/payouts/types";

export default function AffiliatePayoutDetailPage() {
  const params = useParams<{ id: string }>();

  const { data, error, isLoading, refetch } = useQuery({
    queryKey: ["payout", params.id],
    queryFn: () =>
      apiFetch<{ batch: PayoutBatchDetail }>(`/api/payouts/${params.id}`),
  });

  if (isLoading) {
    return <p className="text-muted-foreground">Loading payout...</p>;
  }

  if (error) {
    return <ErrorState message={error.message} onRetry={() => refetch()} />;
  }

  if (!data?.batch) {
    return <p className="text-muted-foreground">Payout not found.</p>;
  }

  return (
    <PayoutBatchDetailView
      batch={data.batch}
      backHref="/dashboard?tab=payouts"
      backLabel="Back to payouts"
    />
  );
}
