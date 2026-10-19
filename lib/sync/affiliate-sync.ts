import { getSettings } from "../settings";
import {
  fetchSliceWPAffiliateById,
  fetchSliceWPCommissionsForAffiliates,
} from "../integrations/slicewp";
import { prisma } from "../prisma";
import { assertSyncTargetsAgree } from "../env-guard";
import { fetchWooCustomersByIds } from "../integrations/woocommerce";
import { ensureSponsorDownlineTeam } from "../teams/members";
import {
  affiliateUserIds,
  getParentSlicewpId,
  relinkAffiliateParent,
  toValidAffiliate,
  upsertAffiliate,
} from "./affiliates";
import { persistRemoteCommissions } from "./commissions";
import { syncSlicewpPayoutsSafely } from "./optional-steps";

export type AffiliateSyncResult = {
  affiliateId: string;
  slicewpId: number;
  displayName: string | null;
  recruitsIncluded: number;
  commissionsUpserted: number;
  slicewpPayoutsSynced: number;
};

/**
 * Refreshes one affiliate plus their direct recruits, without touching the
 * rest of the base. Recruit commissions are included because the sponsor's
 * team bonuses are derived from them.
 *
 * Runs independently of the global sync lock — it only writes rows belonging
 * to these affiliates, and upserts are idempotent.
 */
export async function syncAffiliate(
  affiliateId: string
): Promise<AffiliateSyncResult> {
  const settings = await getSettings();
  if (!settings.slicewpConsumerKey || !settings.slicewpConsumerSecret) {
    throw new Error("SliceWP credentials are not configured");
  }

  assertSyncTargetsAgree(settings.wcStoreUrl);

  const existing = await prisma.affiliate.findUnique({
    where: { id: affiliateId },
    select: { id: true, slicewpId: true },
  });
  if (!existing) {
    throw new Error("Affiliate not found");
  }

  const remote = await fetchSliceWPAffiliateById(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    existing.slicewpId
  );
  if (!remote) {
    throw new Error(
      `SliceWP has no affiliate ${existing.slicewpId} — it may have been deleted.`
    );
  }

  const customers = await fetchWooCustomersByIds(
    settings.wcStoreUrl,
    settings.wcConsumerKey,
    settings.wcConsumerSecret,
    affiliateUserIds([remote])
  );

  const valid = toValidAffiliate(remote, customers.get(Number(remote.user_id)));
  if (!valid) {
    throw new Error(
      `SliceWP affiliate ${existing.slicewpId} has no email address to sync.`
    );
  }

  const affiliate = await upsertAffiliate(valid, new Date());
  await relinkAffiliateParent(affiliate.id, getParentSlicewpId(remote));

  const recruits = await prisma.affiliate.findMany({
    where: { parentAffiliateId: affiliate.id },
    select: { slicewpId: true },
  });

  if (recruits.length > 0) {
    await ensureSponsorDownlineTeam(affiliate.id);
  }

  const remoteCommissions = await fetchSliceWPCommissionsForAffiliates(
    settings.wcStoreUrl,
    settings.slicewpConsumerKey,
    settings.slicewpConsumerSecret,
    [affiliate.slicewpId, ...recruits.map((recruit) => recruit.slicewpId)]
  );

  const commissionsUpserted = await persistRemoteCommissions(remoteCommissions);
  const slicewpPayoutsSynced = await syncSlicewpPayoutsSafely([affiliate.id]);

  await prisma.syncLog.create({
    data: {
      type: "affiliate",
      status: "success",
      message: `Synced ${affiliate.displayName ?? affiliate.email} (${commissionsUpserted} commissions)`,
      metadata: {
        affiliateId: affiliate.id,
        slicewpId: affiliate.slicewpId,
        recruitsIncluded: recruits.length,
        commissionsUpserted,
        slicewpPayoutsSynced,
      },
    },
  });

  return {
    affiliateId: affiliate.id,
    slicewpId: affiliate.slicewpId,
    displayName: affiliate.displayName,
    recruitsIncluded: recruits.length,
    commissionsUpserted,
    slicewpPayoutsSynced,
  };
}
