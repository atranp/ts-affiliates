"use client";

import {
  PayoutsHomeTable,
  PayoutsHomeTableSkeleton,
} from "@/components/affiliate/PayoutsHomeTable";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
} from "@/components/affiliate/primitives";
import { useAffiliatePayouts } from "@/hooks/use-payouts";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";

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
  const { data, isLoading } = useAffiliatePayouts(enabled);

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
