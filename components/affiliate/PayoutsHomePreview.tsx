"use client";

import {
  PayoutsHomeTable,
  PayoutsHomeTableSkeleton,
} from "@/components/affiliate/PayoutsHomeTable";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
} from "@/components/affiliate/primitives";
import { apiFetch } from "@/lib/api-client";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import type { PayoutBatchListItem } from "@/lib/payouts/types";
import { useQuery } from "@tanstack/react-query";

const PREVIEW_LIMIT = 3;
const DETAIL_HREF_PREFIX = "/dashboard/payouts";

type PayoutsHomePreviewProps = {
  enabled?: boolean;
  onViewPayouts: () => void;
};

export function PayoutsHomePreview({
  enabled = true,
  onViewPayouts,
}: PayoutsHomePreviewProps) {
  const { data, isLoading } = useQuery({
    queryKey: ["payouts"],
    queryFn: () => apiFetch<{ batches: PayoutBatchListItem[] }>("/api/payouts"),
    enabled,
    staleTime: 60 * 1000,
  });

  if (isLoading) {
    return (
      <AffiliateHomeCard
        className="flex min-h-0 flex-col"
        title={AFFILIATE_COPY.home.payoutsTitle}
        actionLabel={AFFILIATE_COPY.home.payoutsAction}
        onAction={onViewPayouts}
        contentClassName="p-0"
      >
        <PayoutsHomeTableSkeleton />
      </AffiliateHomeCard>
    );
  }

  const batches = data?.batches ?? [];

  return (
    <AffiliateHomeCard
      className="flex min-h-0 flex-col"
      title={AFFILIATE_COPY.home.payoutsTitle}
      actionLabel={AFFILIATE_COPY.home.payoutsAction}
      onAction={onViewPayouts}
      contentClassName="p-0"
    >
      {batches.length > 0 ? (
        <PayoutsHomeTable
          batches={batches.slice(0, PREVIEW_LIMIT)}
          detailHrefPrefix={DETAIL_HREF_PREFIX}
        />
      ) : (
        <div className="p-4 sm:p-5">
          <AffiliateEmptyState>{AFFILIATE_COPY.payouts.empty}</AffiliateEmptyState>
        </div>
      )}
    </AffiliateHomeCard>
  );
}
