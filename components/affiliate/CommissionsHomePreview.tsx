"use client";

import { useState } from "react";
import {
  CommissionsHomeTable,
  CommissionsHomeTableSkeleton,
} from "@/components/affiliate/CommissionsHomeTable";
import { CommissionDetailDrawer } from "@/components/affiliate/CommissionDetailDrawer";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
} from "@/components/affiliate/primitives";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { useLedger } from "@/hooks/use-ledger";

const PREVIEW_LIMIT = 3;

type CommissionsHomePreviewProps = {
  enabled?: boolean;
  onViewCommissions: () => void;
};

export function CommissionsHomePreview({
  enabled = true,
  onViewCommissions,
}: CommissionsHomePreviewProps) {
  const [detailEntryId, setDetailEntryId] = useState<string | null>(null);
  const { data, isLoading } = useLedger({
    limit: PREVIEW_LIMIT,
    page: 1,
    enabled,
  });

  if (isLoading) {
    return (
      <AffiliateHomeCard
        className="flex min-h-0 flex-col"
        title={AFFILIATE_COPY.home.commissionsTitle}
        actionLabel={AFFILIATE_COPY.home.viewAllCommissions}
        onAction={onViewCommissions}
        contentClassName="p-0"
      >
        <CommissionsHomeTableSkeleton />
      </AffiliateHomeCard>
    );
  }

  if (!data) return null;

  const { entries } = data;

  return (
    <>
    <AffiliateHomeCard
      className="flex min-h-0 flex-col"
      title={AFFILIATE_COPY.home.commissionsTitle}
      actionLabel={AFFILIATE_COPY.home.viewAllCommissions}
      onAction={onViewCommissions}
      contentClassName="p-0"
    >
      {entries.length > 0 ? (
        <CommissionsHomeTable
          entries={entries}
          onEntryClick={setDetailEntryId}
        />
      ) : (
        <div className="p-4 sm:p-5">
          <AffiliateEmptyState>
            {AFFILIATE_COPY.commissions.empty}
          </AffiliateEmptyState>
        </div>
      )}
    </AffiliateHomeCard>
    <CommissionDetailDrawer
      entryId={detailEntryId}
      onClose={() => setDetailEntryId(null)}
    />
    </>
  );
}
