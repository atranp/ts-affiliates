import {
  getPayoutBatchDetail,
  listPayoutBatchesForAffiliate,
} from "./queries";
import {
  getSlicewpPayoutDetail,
  listSlicewpPayoutsForAffiliate,
} from "./slicewp-queries";
import type { PayoutBatchDetail, PayoutBatchListItem } from "./types";

function payoutTime(batch: PayoutBatchListItem): number {
  return new Date(batch.processedAt ?? batch.createdAt).getTime();
}

/**
 * Everything an affiliate has been paid, whether the payout was recorded here
 * or in SliceWP. Both sources are capped at `limit` before merging so a run of
 * recent payouts from one of them cannot crowd the other out of the window.
 */
export async function listPayoutHistoryForAffiliate(
  affiliateId: string,
  limit = 20
): Promise<PayoutBatchListItem[]> {
  const [platform, slicewp] = await Promise.all([
    listPayoutBatchesForAffiliate(affiliateId, limit),
    listSlicewpPayoutsForAffiliate(affiliateId, limit),
  ]);

  return [...platform, ...slicewp]
    .sort((a, b) => payoutTime(b) - payoutTime(a))
    .slice(0, limit);
}

/**
 * Ids are cuids from either table, so the source is resolved by lookup rather
 * than encoded in the URL. Keeps `/payouts/[id]` working for both.
 */
export async function getPayoutDetail(
  id: string,
  options?: { affiliateId?: string }
): Promise<PayoutBatchDetail | null> {
  const batch = await getPayoutBatchDetail(id, options);
  if (batch) return batch;
  return getSlicewpPayoutDetail(id, options);
}
