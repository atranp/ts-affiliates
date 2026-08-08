"use client";

import { CommissionRow } from "@/components/affiliate/CommissionRow";
import { InlinePanelSkeleton } from "@/components/affiliate/DashboardSkeleton";
import {
  AffiliateEmptyState,
  AffiliateHomeCard,
  AffiliateListPanel,
} from "@/components/affiliate/primitives";
import { AFFILIATE_COPY } from "@/lib/affiliate/copy";
import { useLedger } from "@/hooks/use-ledger";
import { effectiveLedgerStatus } from "@/lib/payouts/status";
import { formatCurrency } from "@/lib/utils";

const PREVIEW_LIMIT = 3;

type CommissionsHomePreviewProps = {
  enabled?: boolean;
  onViewCommissions: () => void;
};

export function CommissionsHomePreview({
  enabled = true,
  onViewCommissions,
}: CommissionsHomePreviewProps) {
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
      >
        <InlinePanelSkeleton className="h-28" />
      </AffiliateHomeCard>
    );
  }

  if (!data) return null;

  const { entries } = data;

  return (
    <AffiliateHomeCard
      className="flex min-h-0 flex-col"
      title={AFFILIATE_COPY.home.commissionsTitle}
      actionLabel={AFFILIATE_COPY.home.viewAllCommissions}
      onAction={onViewCommissions}
      contentClassName="py-3 sm:py-3"
    >
      {entries.length > 0 ? (
        <AffiliateListPanel scroll inset>
          <ul className="flex flex-col gap-2">
            {entries.map((entry) => {
              const status = effectiveLedgerStatus(
                entry.status,
                entry.payoutBatch
              );
              const details =
                entry.description ??
                entry.sourceAffiliate?.displayName ??
                entry.sourceAffiliate?.email ??
                "—";

              return (
                <li key={entry.id}>
                  <CommissionRow
                    details={details}
                    occurredAt={entry.occurredAt}
                    orderRevenue={entry.orderRevenue}
                    amount={formatCurrency(entry.amount)}
                    status={status}
                    type={entry.type}
                    onClick={onViewCommissions}
                  />
                </li>
              );
            })}
          </ul>
        </AffiliateListPanel>
      ) : (
        <AffiliateEmptyState>
          {AFFILIATE_COPY.commissions.empty}
        </AffiliateEmptyState>
      )}
    </AffiliateHomeCard>
  );
}
